import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FirebaseFacts } from "./templates.js";

const exec = promisify(execFile);

/**
 * Provision what a website needs to exist: a GCP project, Firebase, Firestore,
 * a registered web app, and the identity a Vercel deployment authenticates as.
 *
 * This is the half `morpheus init` deliberately does not do (§12.11) — it lives
 * in someone else's console and needs credentials the repository scaffold
 * should not hold. Splitting it into its own command keeps that property: `init`
 * still cannot be blocked on a token, and this one is allowed to be.
 *
 * **Every step is detect, then act, then report what is true.** A step that
 * cannot determine its own outcome reports `blocked` with the reason; nothing
 * here returns `done` on the strength of a command having exited zero, because
 * an unconfigured verifier reporting success is the failure this repository has
 * written down four times.
 *
 * **Nothing is destructive.** Every step either finds what it needs or creates
 * something that was absent. No step deletes, disables, or rewrites a resource
 * someone else made.
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<CommandResult>;

export type StepState = "already" | "created" | "skipped" | "blocked";

export interface StepResult {
  id: string;
  title: string;
  state: StepState;
  detail: string;
}

export interface ProvisionOptions {
  root: string;
  /** Firebase / GCP project id, e.g. `dh-evo`. */
  project: string;
  /** Display name for a project this run creates. At least four characters. */
  displayName: string;
  /** GCP organisation id, when one should own a newly created project. */
  organization?: string;
  /** Vercel team slug, for the OIDC issuer. Without it, federation is skipped. */
  vercelTeam?: string;
  /** Google account to act as. Passed explicitly rather than left ambient. */
  account?: string;
  runner?: CommandRunner;
}

export interface ProvisionResult {
  steps: StepResult[];
  /** Present once the web app is registered and its SDK config was read. */
  firebase?: FirebaseFacts;
}

const POOL_ID = "vercel";
const PROVIDER_ID = "vercel-oidc";
const SERVICE_ACCOUNT_ID = "vercel-hq";

/** Firestore is `nam5` on every project — permanent, and decided once. */
const FIRESTORE_LOCATION = "nam5";

const REQUIRED_SERVICES = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  // `iam` owns workload-identity pools and service accounts; `iamcredentials`
  // only owns the token exchange. Enabling the second without the first is the
  // shape that got shipped first, and it fails much later and much less
  // legibly: pool creation returns `PERMISSION_DENIED ... on resource
  // //iam.googleapis.com/projects/<id>/locations/global (or it may not exist)`,
  // which reads as a missing role on a fresh project rather than a missing API.
  "iam.googleapis.com",
  "iamcredentials.googleapis.com",
  "sts.googleapis.com",
];

async function systemRunner(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const { stdout, stderr } = await exec(command, args, { cwd, maxBuffer: 8 * 1024 * 1024 });
  return { stdout, stderr };
}

function message(error: unknown): string {
  if (error instanceof Error) {
    // execFile rejects with stderr attached; that is the part worth reporting,
    // and its first line is almost always the whole diagnosis.
    const stderr = (error as { stderr?: string }).stderr;
    const first = stderr?.trim().split("\n").find((line) => line.trim().length > 0);
    return first ?? error.message;
  }
  return String(error);
}

/**
 * A named step, with its outcome recorded whatever happens.
 *
 * `run` returns the state and detail; a throw becomes `blocked`. The point is
 * that no step can fall out of the sequence silently — a provisioner whose
 * failures are invisible reports a half-built project as a finished one.
 */
async function step(
  steps: StepResult[],
  id: string,
  title: string,
  run: () => Promise<{ state: StepState; detail: string }>,
): Promise<StepResult> {
  let result: StepResult;
  try {
    const { state, detail } = await run();
    result = { id, title, state, detail };
  } catch (error) {
    result = { id, title, state: "blocked", detail: message(error) };
  }
  steps.push(result);
  return result;
}

export async function provisionWeb(opts: ProvisionOptions): Promise<ProvisionResult> {
  const runner = opts.runner ?? systemRunner;
  const steps: StepResult[] = [];

  const gcloud = (args: string[]) =>
    runner("gcloud", opts.account ? [...args, "--account", opts.account] : args, opts.root);
  const firebase = (args: string[]) => runner("firebase", args, opts.root);

  /** True when the resource exists; false when the describe says it does not. */
  const describes = async (command: () => Promise<CommandResult>): Promise<boolean> => {
    try {
      await command();
      return true;
    } catch (error) {
      const text = message(error).toLowerCase();
      // Distinguish absent from unreachable. A permission error is not evidence
      // that a project does not exist — it is evidence we cannot tell, and
      // creating one on that basis would make a duplicate under the wrong
      // identity.
      if (text.includes("not_found") || text.includes("not found") || text.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  };

  // --- the GCP project ------------------------------------------------------
  const project = await step(steps, "gcp-project", `GCP project ${opts.project}`, async () => {
    if (await describes(() => gcloud(["projects", "describe", opts.project, "--format=value(projectId)"]))) {
      return { state: "already", detail: "exists" };
    }
    // Ids are globally unique across all of GCP, so a short generic name is
    // always taken — the convention is `<org>-<app>`. Display names under four
    // characters fail with an error that reads like "id taken".
    await gcloud([
      "projects",
      "create",
      opts.project,
      "--name",
      opts.displayName,
      ...(opts.organization ? ["--organization", opts.organization] : []),
    ]);
    return { state: "created", detail: `created as "${opts.displayName}"` };
  });

  if (project.state === "blocked" || project.state === "skipped") {
    return { steps };
  }

  const projectNumber = await readProjectNumber(gcloud, opts.project).catch(() => null);

  // --- services -------------------------------------------------------------
  await step(steps, "services", "Required Google APIs enabled", async () => {
    await gcloud(["services", "enable", ...REQUIRED_SERVICES, "--project", opts.project]);
    return { state: "created", detail: REQUIRED_SERVICES.join(", ") };
  });

  // --- Firebase -------------------------------------------------------------
  await step(steps, "firebase", "Firebase enabled on the project", async () => {
    const { stdout } = await firebase(["projects:list", "--json"]);
    const listed = JSON.parse(stdout) as { result?: { projectId?: string }[] };
    if (listed.result?.some((entry) => entry.projectId === opts.project)) {
      return { state: "already", detail: "already a Firebase project" };
    }
    try {
      await firebase(["projects:addfirebase", opts.project]);
    } catch (error) {
      const text = message(error);
      // A 403 here is almost never IAM. It is an account that has never
      // accepted the Firebase Terms of Service, and the error names none of
      // that — it cost a long session once already.
      if (text.includes("403") || text.toLowerCase().includes("permission")) {
        throw new Error(
          `${text} — a 403 from addFirebase is usually unaccepted Firebase Terms of ` +
            "Service, not IAM. Accept them once at https://console.firebase.google.com " +
            `(append ?authuser=<your email>), then re-run.`,
        );
      }
      throw error;
    }
    return { state: "created", detail: "Firebase enabled" };
  });

  // --- Firestore ------------------------------------------------------------
  await step(steps, "firestore", `Firestore database (${FIRESTORE_LOCATION})`, async () => {
    // `list`, not `describe`. On a project with no database, `describe` answers
    // `PERMISSION_DENIED` rather than `NOT_FOUND` — so the absent case is
    // indistinguishable from a real refusal and the step blocks forever. `list`
    // returns an empty result for absent and still errors for refused, which is
    // the distinction this whole file is built on.
    const { stdout } = await gcloud([
      "firestore",
      "databases",
      "list",
      "--project",
      opts.project,
      "--format=value(name)",
    ]);
    if (stdout.trim()) return { state: "already", detail: "exists" };
    // Multi-region, and unchangeable after creation — which is why it is worth
    // stating rather than defaulting.
    await gcloud([
      "firestore",
      "databases",
      "create",
      `--location=${FIRESTORE_LOCATION}`,
      "--project",
      opts.project,
    ]);
    return { state: "created", detail: `created in ${FIRESTORE_LOCATION}` };
  });

  // --- the web app, and its public config ----------------------------------
  let facts: FirebaseFacts | undefined;
  await step(steps, "web-app", "Firebase web app registered", async () => {
    const appId = await webAppId(firebase, opts.project, opts.displayName);
    const config = await sdkConfig(firebase, opts.project, appId.id);
    facts = {
      projectId: opts.project,
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    };
    return { state: appId.created ? "created" : "already", detail: config.appId };
  });

  // --- Workload Identity Federation ----------------------------------------
  //
  // How the deployment authenticates without a key. Skipped rather than guessed
  // when the Vercel team slug is unknown: the issuer URI is built from it, and
  // a provider trusting the wrong issuer is worse than no provider.
  if (facts && projectNumber) {
    if (!opts.vercelTeam) {
      steps.push({
        id: "workload-identity",
        title: "Workload Identity Federation for Vercel",
        state: "skipped",
        detail:
          "no Vercel team slug — set accounts.vercel in morpheus.json, or pass --vercel-team",
      });
    } else {
      const federation = await provisionFederation(steps, gcloud, opts, projectNumber);
      if (federation) {
        facts.workloadIdentity = {
          poolId: POOL_ID,
          providerId: PROVIDER_ID,
          serviceAccount: serviceAccountEmail(opts.project),
        };
      }
    }
  }

  return { steps, ...(facts ? { firebase: facts } : {}) };
}

function serviceAccountEmail(project: string): string {
  return `${SERVICE_ACCOUNT_ID}@${project}.iam.gserviceaccount.com`;
}

async function readProjectNumber(
  gcloud: (args: string[]) => Promise<CommandResult>,
  project: string,
): Promise<string> {
  const { stdout } = await gcloud([
    "projects",
    "describe",
    project,
    "--format=value(projectNumber)",
  ]);
  const number = stdout.trim();
  if (!number) throw new Error(`Could not read the project number for ${project}.`);
  return number;
}

interface SdkConfig {
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/** The web app's id, registering one if the project has none. */
async function webAppId(
  firebase: (args: string[]) => Promise<CommandResult>,
  project: string,
  displayName: string,
): Promise<{ id: string; created: boolean }> {
  const { stdout } = await firebase(["apps:list", "WEB", "--project", project, "--json"]);
  const listed = JSON.parse(stdout) as { result?: { appId?: string }[] };
  const existing = listed.result?.find((entry) => typeof entry.appId === "string");
  if (existing?.appId) return { id: existing.appId, created: false };

  const created = await firebase(["apps:create", "WEB", displayName, "--project", project, "--json"]);
  const parsed = JSON.parse(created.stdout) as { result?: { appId?: string } };
  if (!parsed.result?.appId) {
    throw new Error("Firebase created a web app but returned no app id.");
  }
  return { id: parsed.result.appId, created: true };
}

/**
 * The public web config.
 *
 * Read from Firebase rather than assembled from the project id: `apiKey` and
 * `appId` cannot be derived, and a config with a guessed field fails at
 * sign-in with an error that names none of it.
 */
async function sdkConfig(
  firebase: (args: string[]) => Promise<CommandResult>,
  project: string,
  appId: string,
): Promise<SdkConfig> {
  const { stdout } = await firebase(["apps:sdkconfig", "WEB", appId, "--project", project, "--json"]);
  const parsed = JSON.parse(stdout) as {
    result?: { sdkConfig?: Partial<SdkConfig> };
  };
  const config = parsed.result?.sdkConfig;
  const missing = (["apiKey", "authDomain", "storageBucket", "messagingSenderId", "appId"] as const)
    .filter((key) => typeof config?.[key] !== "string" || !config[key]);
  if (!config || missing.length) {
    throw new Error(`Firebase SDK config is missing ${missing.join(", ") || "everything"}.`);
  }
  return config as SdkConfig;
}

/**
 * Pool, provider, service account and the four bindings between them.
 *
 * Returns true only when every part is in place. Each is idempotent — an
 * existing pool is adopted, an existing binding is a no-op — so a re-run after
 * a partial failure completes rather than duplicating.
 */
async function provisionFederation(
  steps: StepResult[],
  gcloud: (args: string[]) => Promise<CommandResult>,
  opts: ProvisionOptions,
  projectNumber: string,
): Promise<boolean> {
  const project = opts.project;
  const team = opts.vercelTeam!;
  const serviceAccount = serviceAccountEmail(project);

  const result = await step(
    steps,
    "workload-identity",
    "Workload Identity Federation for Vercel",
    async () => {
      const created: string[] = [];

      const poolExists = await gcloud([
        "iam",
        "workload-identity-pools",
        "describe",
        POOL_ID,
        "--location=global",
        "--project",
        project,
        "--format=value(name)",
      ]).then(
        () => true,
        () => false,
      );
      if (!poolExists) {
        await gcloud([
          "iam",
          "workload-identity-pools",
          "create",
          POOL_ID,
          "--location=global",
          "--display-name=Vercel",
          "--project",
          project,
        ]);
        created.push("pool");
      }

      const providerExists = await gcloud([
        "iam",
        "workload-identity-pools",
        "providers",
        "describe",
        PROVIDER_ID,
        "--location=global",
        `--workload-identity-pool=${POOL_ID}`,
        "--project",
        project,
        "--format=value(name)",
      ]).then(
        () => true,
        () => false,
      );
      if (!providerExists) {
        await gcloud([
          "iam",
          "workload-identity-pools",
          "providers",
          "create-oidc",
          PROVIDER_ID,
          "--location=global",
          `--workload-identity-pool=${POOL_ID}`,
          `--issuer-uri=https://oidc.vercel.com/${team}`,
          `--allowed-audiences=https://vercel.com/${team}`,
          "--attribute-mapping=google.subject=assertion.sub,attribute.aud=assertion.aud",
          "--project",
          project,
        ]);
        created.push("provider");
      }

      const accountExists = await gcloud([
        "iam",
        "service-accounts",
        "describe",
        serviceAccount,
        "--project",
        project,
        "--format=value(email)",
      ]).then(
        () => true,
        () => false,
      );
      if (!accountExists) {
        await gcloud([
          "iam",
          "service-accounts",
          "create",
          SERVICE_ACCOUNT_ID,
          "--display-name=Vercel deployment",
          "--project",
          project,
        ]);
        created.push("service account");
      }

      // Two roles, and both are needed for different halves of the site:
      // minting a session cookie, and writing a waitlist signup. A missing
      // datastore.user surfaces as PERMISSION_DENIED on the first signup and
      // nowhere earlier.
      for (const role of ["roles/firebaseauth.admin", "roles/datastore.user"]) {
        await gcloud([
          "projects",
          "add-iam-policy-binding",
          project,
          `--member=serviceAccount:${serviceAccount}`,
          `--role=${role}`,
          "--condition=None",
        ]);
      }

      // Who may impersonate it: any identity from the Vercel pool. The
      // provider's allowed audience is what narrows that to this team.
      await gcloud([
        "iam",
        "service-accounts",
        "add-iam-policy-binding",
        serviceAccount,
        `--member=principalSet://iam.googleapis.com/projects/${projectNumber}` +
          `/locations/global/workloadIdentityPools/${POOL_ID}/*`,
        "--role=roles/iam.workloadIdentityUser",
        "--project",
        project,
      ]);

      return {
        state: created.length ? "created" : "already",
        detail: created.length
          ? `${created.join(", ")} created; roles bound`
          : "pool, provider and service account already present; roles bound",
      };
    },
  );

  return result.state === "created" || result.state === "already";
}

/** Everything that is not `already` or `created` — what still stands between here and working. */
export function outstanding(steps: StepResult[]): StepResult[] {
  return steps.filter((entry) => entry.state === "blocked" || entry.state === "skipped");
}
