import { describe, expect, it } from "vitest";
import { outstanding, provisionWeb, type CommandRunner } from "../src/web/provision.js";

/**
 * The provisioner, against a scripted cloud.
 *
 * Everything here is about the difference between *knowing* and *assuming*: a
 * project that exists, a project that does not, and a project we were not
 * allowed to look at are three answers, and only the second one may lead to a
 * create.
 */

interface World {
  /** Commands that fail, keyed by a prefix of their command line. */
  failures?: Record<string, Error>;
  /** Command-line prefixes whose failure means "absent" rather than "unknown". */
  missing?: string[];
  /** Stdout overrides, keyed by a prefix of the command line. */
  responses?: Record<string, string>;
}

function notFound(what: string): Error {
  return Object.assign(new Error("failed"), { stderr: `ERROR: NOT_FOUND: ${what} does not exist` });
}

function runner(calls: string[][], world: World = {}): CommandRunner {
  return async (command, args) => {
    const line = [command, ...args].join(" ");
    calls.push([command, ...args]);

    if (world.missing?.some((prefix) => line.startsWith(prefix))) throw notFound(line);
    const failure = world.failures?.[Object.keys(world.failures).find((key) => line.startsWith(key)) ?? ""];
    if (failure) throw failure;

    const override = Object.entries(world.responses ?? {}).find(([prefix]) => line.startsWith(prefix));
    if (override) return { stdout: override[1], stderr: "" };

    if (line.startsWith("gcloud projects describe") && line.includes("projectNumber")) {
      return { stdout: "717033107528\n", stderr: "" };
    }
    if (line.startsWith("gcloud projects describe")) return { stdout: "dh-acme\n", stderr: "" };
    if (line.startsWith("firebase projects:list")) {
      return { stdout: JSON.stringify({ result: [{ projectId: "dh-acme" }] }), stderr: "" };
    }
    if (line.startsWith("firebase apps:list")) {
      return { stdout: JSON.stringify({ result: [{ appId: "1:717033107528:web:abc" }] }), stderr: "" };
    }
    if (line.startsWith("firebase apps:sdkconfig")) {
      return {
        stdout: JSON.stringify({
          result: {
            sdkConfig: {
              apiKey: "AIza-test",
              authDomain: "dh-acme.firebaseapp.com",
              storageBucket: "dh-acme.firebasestorage.app",
              messagingSenderId: "717033107528",
              appId: "1:717033107528:web:abc",
            },
          },
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  };
}

const options = (calls: string[][], world?: World) => ({
  root: "/tmp/does-not-matter",
  project: "dh-acme",
  displayName: "Acme",
  vercelTeam: "acme-team",
  runner: runner(calls, world),
});

describe("provisionWeb", () => {
  it("adopts everything that already exists and creates nothing", async () => {
    const calls: string[][] = [];
    const result = await provisionWeb(
      options(calls, {
        responses: {
          "gcloud firestore databases list": "projects/dh-acme/databases/(default)",
        },
      }),
    );

    expect(result.steps.find((step) => step.id === "gcp-project")?.state).toBe("already");
    expect(result.steps.find((step) => step.id === "firebase")?.state).toBe("already");
    expect(result.steps.find((step) => step.id === "firestore")?.state).toBe("already");
    expect(result.steps.find((step) => step.id === "web-app")?.state).toBe("already");
    expect(
      calls.filter(([, ...args]) => args[0] === "firestore" && args[2] === "create"),
    ).toEqual([]);
    expect(calls.some(([command, ...args]) => command === "gcloud" && args[1] === "create")).toBe(false);
    expect(calls.some(([, ...args]) => args.join(" ").startsWith("projects:addfirebase"))).toBe(false);
  });

  it("reads the public SDK config rather than deriving it", async () => {
    const calls: string[][] = [];
    const result = await provisionWeb(options(calls));

    // apiKey and appId cannot be derived from a project id; a guessed field
    // fails at sign-in with an error that names none of it.
    expect(result.firebase?.apiKey).toBe("AIza-test");
    expect(result.firebase?.appId).toBe("1:717033107528:web:abc");
    expect(result.firebase?.workloadIdentity?.serviceAccount).toBe(
      "vercel-hq@dh-acme.iam.gserviceaccount.com",
    );
  });

  it("creates the project only when a describe says it is absent", async () => {
    const calls: string[][] = [];
    await provisionWeb(options(calls, { missing: ["gcloud projects describe"] }));

    const created = calls.find(([command, ...args]) => command === "gcloud" && args[0] === "projects" && args[1] === "create");
    expect(created).toBeDefined();
    // Under four characters fails with an error that reads like "id taken".
    expect(created?.join(" ")).toContain("--name Acme");
  });

  it("does not create a project it was merely refused a look at", async () => {
    const calls: string[][] = [];
    const denied = Object.assign(new Error("failed"), {
      stderr: "ERROR: does not have permission to access projects instance [dh-acme]",
    });
    const result = await provisionWeb(options(calls, { failures: { "gcloud projects describe": denied } }));

    // A permission error is not evidence that a project does not exist. It is
    // evidence we cannot tell, and creating one on that basis makes a duplicate
    // under the wrong identity.
    expect(result.steps[0]?.state).toBe("blocked");
    expect(result.steps[0]?.detail).toContain("does not have permission");
    expect(calls.filter(([, ...args]) => args[0] === "projects" && args[1] === "create")).toEqual([]);
    // And it stops there rather than provisioning into a project it cannot see.
    expect(result.steps).toHaveLength(1);
    expect(result.firebase).toBeUndefined();
  });

  it("names the Terms of Service when Firebase answers 403", async () => {
    const calls: string[][] = [];
    const forbidden = Object.assign(new Error("failed"), {
      stderr: "Error: HTTP Error: 403, The caller does not have permission",
    });
    // The project must be absent from projects:list, or addfirebase is never
    // reached and this asserts nothing.
    const world: World = {
      failures: { "firebase projects:addfirebase": forbidden },
      responses: { "firebase projects:list": JSON.stringify({ result: [] }) },
    };
    const result = await provisionWeb(options(calls, world));

    const step = result.steps.find((entry) => entry.id === "firebase");
    expect(step?.state).toBe("blocked");
    // A 403 from addFirebase is almost never IAM, and the raw error names none
    // of that — it cost a long debugging session once already.
    expect(step?.detail).toContain("Terms of Service");
    expect(calls.some(([, ...args]) => args[0] === "projects:addfirebase")).toBe(true);
  });

  it("passes an explicit account to gcloud rather than relying on the ambient one", async () => {
    const calls: string[][] = [];
    await provisionWeb({ ...options(calls), account: "chris@example.com" });

    const gcloudCalls = calls.filter(([command]) => command === "gcloud");
    expect(gcloudCalls.length).toBeGreaterThan(0);
    expect(gcloudCalls.every((call) => call.includes("--account") && call.includes("chris@example.com"))).toBe(true);
  });

  it("skips federation rather than trusting a guessed issuer", async () => {
    const calls: string[][] = [];
    const { runner: scripted } = options(calls);
    const result = await provisionWeb({
      root: "/tmp/does-not-matter",
      project: "dh-acme",
      displayName: "Acme",
      runner: scripted,
    });

    const federation = result.steps.find((step) => step.id === "workload-identity");
    expect(federation?.state).toBe("skipped");
    expect(result.firebase?.workloadIdentity).toBeUndefined();
    expect(outstanding(result.steps)).toContain(federation);
  });

  it("asks Firestore for a list, because describe cannot say 'absent'", async () => {
    const calls: string[][] = [];
    // Exactly what a real project with no database returns: `list` is empty,
    // and `describe` would have said PERMISSION_DENIED — which the first
    // version of this step read as a refusal and blocked on.
    const result = await provisionWeb(
      options(calls, { responses: { "gcloud firestore databases list": "" } }),
    );

    expect(result.steps.find((step) => step.id === "firestore")?.state).toBe("created");
    const firestoreCalls = calls.filter(([, ...args]) => args[0] === "firestore").map((c) => c.join(" "));
    expect(firestoreCalls.some((line) => line.includes("databases list"))).toBe(true);
    expect(firestoreCalls.some((line) => line.includes("databases describe"))).toBe(false);
    expect(firestoreCalls.some((line) => line.includes("--location=nam5"))).toBe(true);
  });

  it("enables the IAM API, not only the credentials one", async () => {
    const calls: string[][] = [];
    await provisionWeb(options(calls));

    const enabled = calls.find(([, ...args]) => args[0] === "services" && args[1] === "enable")?.join(" ");
    // Found on cph-evo: without `iam`, pool creation fails with a
    // PERMISSION_DENIED that reads like a missing role rather than a missing
    // API, several steps later.
    expect(enabled).toContain("iam.googleapis.com");
    expect(enabled).toContain("iamcredentials.googleapis.com");
  });

  it("binds both roles, because auth and the waitlist need different ones", async () => {
    const calls: string[][] = [];
    await provisionWeb(options(calls));

    const bindings = calls
      .filter(([, ...args]) => args[0] === "projects" && args[1] === "add-iam-policy-binding")
      .map((call) => call.join(" "));
    expect(bindings.some((line) => line.includes("roles/firebaseauth.admin"))).toBe(true);
    // A missing datastore.user surfaces as PERMISSION_DENIED on the first
    // signup and nowhere earlier.
    expect(bindings.some((line) => line.includes("roles/datastore.user"))).toBe(true);
  });

  it("reports a blocked step rather than continuing past it", async () => {
    const calls: string[][] = [];
    const broken = Object.assign(new Error("failed"), { stderr: "ERROR: quota exceeded" });
    const result = await provisionWeb(options(calls, { failures: { "gcloud firestore databases": broken } }));

    const firestore = result.steps.find((step) => step.id === "firestore");
    expect(firestore?.state).toBe("blocked");
    expect(firestore?.detail).toContain("quota exceeded");
    expect(outstanding(result.steps).length).toBeGreaterThan(0);
  });
});
