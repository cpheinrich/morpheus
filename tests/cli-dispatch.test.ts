import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/cli/run.js";
import { HELP } from "../src/cli/help.js";
import { guard } from "../src/cli/context.js";
import { webInit } from "../src/cli/web.js";
vi.mock("../src/cli/pm.js", () => ({ block: vi.fn(async () => ({ code: 73, written: [] })), claim: vi.fn(async () => 73), claims: vi.fn(async () => 73), create: vi.fn(async () => 73), index: vi.fn(async () => 73), linkIssue: vi.fn(async () => 73), migrateIds: vi.fn(async () => 73), ship: vi.fn(async () => 73), unblock: vi.fn(async () => 73), validate: vi.fn(async () => 73) }));
vi.mock("../src/cli/check.js", () => ({ pr: vi.fn(async () => 73) }));
vi.mock("../src/cli/inbox.js", () => ({ validate: vi.fn(async () => 73) }));
vi.mock("../src/cli/brand.js", () => ({ build: vi.fn(async () => 73), check: vi.fn(async () => 73), explore: vi.fn(async () => 73), finalize: vi.fn(async () => 73), init: vi.fn(async () => 73), migrate: vi.fn(async () => 73), resolveBrandIdentity: vi.fn(async () => ({ name: "Example", prefix: "EX" })) }));
vi.mock("../src/cli/brand-status.js", () => ({ status: vi.fn(async () => 73) }));
vi.mock("../src/cli/access.js", () => ({ sync: vi.fn(async () => 73) }));
vi.mock("../src/cli/firebase.js", () => ({ checkGoogleAuthConfiguration: vi.fn(async () => 73), configureGoogleAuth: vi.fn(async () => 73) }));
vi.mock("../src/cli/hq.js", () => ({ printRules: vi.fn(async () => 73), rules: vi.fn(async () => 73) }));
vi.mock("../src/cli/doctor.js", () => ({ run: vi.fn(async () => 73) }));
vi.mock("../src/cli/onboarding.js", () => ({ mark: vi.fn(async () => 73), status: vi.fn(async () => 73) }));
vi.mock("../src/cli/init.js", () => ({ init: vi.fn(async () => 73) }));
vi.mock("../src/cli/web.js", () => ({ webAddConsumerAuth: vi.fn(async () => 73), webInit: vi.fn(async () => 73), webStatus: vi.fn(async () => 73) }));
vi.mock("../src/cli/tokens.js", () => ({ build: vi.fn(async () => 73) }));
vi.mock("../src/cli/heartbeat.js", () => ({ heartbeat: vi.fn(async () => 73) }));
vi.mock("../src/cli/review.js", () => ({ prompt: vi.fn(async () => 73), reviewDelivery: vi.fn(async () => 73), reviewNeeded: vi.fn(async () => 73), prepareReview: vi.fn(async () => 73) }));
vi.mock("../src/cli/voice.js", () => ({ brief: vi.fn(async () => 73), knowledge: vi.fn(async () => 73) }));
vi.mock("../src/cli/team.js", () => ({ validate: vi.fn(async () => 73) }));
vi.mock("../src/cli/context.js", () => ({ check: vi.fn(async () => 73), guard: vi.fn(async () => ({ refused: null, contained: false })), brief: vi.fn(async () => 73), install: vi.fn(async () => 73), refresh: vi.fn(async () => 73), status: vi.fn(async () => 73) }));
vi.mock("../src/session/context.js", () => ({ noteWrite: vi.fn(async () => 73) }));
vi.mock("../src/cli/codebase-memory.js", () => ({ install: vi.fn(async () => 73) }));
vi.mock("../src/cli/research-library.js", () => ({ initResearchLibrary: vi.fn(async () => 73), runResearchLibrary: vi.fn(async () => 73) }));
vi.mock("../src/cli/self.js", () => ({ autoUpdate: vi.fn(async () => 73), check: vi.fn(async () => 73), ensure: vi.fn(async () => 73), install: vi.fn(async () => 73), update: vi.fn(async () => 73) }));
vi.mock("../src/cli/registry.js", () => ({ list: vi.fn(async () => 73), add: vi.fn(async () => 73), remove: vi.fn(async () => 73) }));

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
describe("CLI invocation contract", () => {
  it.each([[], ["--help"], ["pm", "new", "--help"], ["bad", "-h"]])("help wins before dispatch: %j", async (...argv) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await run(argv)).toBe(0);
    expect(log).toHaveBeenCalledWith(HELP);
  });
  it.each(["self", "codebase-memory", "voice", "tokens", "research-library", "init", "web", "registry", "hq", "access", "firebase", "brand", "inbox", "review", "team", "context", "check", "pm"])("preserves %s errors", async (group) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run([group, "nonsense"])).toBe(1);
    expect(error).toHaveBeenCalledWith(`Unknown ${group} command "nonsense".\n\n${HELP}`);
  });
  it.each(["nonsense", "constructor", "__proto__"])("rejects unknown group %s", async group => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run([group])).toBe(1);
    expect(error).toHaveBeenCalledWith(`Unknown command "${group}".\n\n${HELP}`);
  });
  it.each(["self", "self check", "self update", "self install", "self ensure", "self auto-update enable", "doctor", "codebase-memory", "codebase-memory install", "heartbeat", "voice knowledge", "voice brief a topic", "tokens", "tokens build", "research-library init", "research-library bundle", "research-library publish book --author A", "init", "init status", "init done task", "init doing task", "init todo task", "web", "web status", "web init", "web add-consumer-auth", "registry list", "registry add", "registry remove item", "hq rules", "hq rules --print", "access sync", "firebase auth setup", "firebase auth check", "brand", "brand status", "brand build", "brand explore", "brand refresh", "brand finalize", "brand migrate", "brand check", "brand init", "inbox validate", "review prepare", "review prompt", "review needed", "review delivery", "team validate", "context", "context refresh", "context check", "context brief", "context install", "context status", "check pr", "pm validate", "pm index", "pm claim MO-001", "pm claims", "pm link-issue MO-001 1", "pm block MO-001 --needs approval", "pm unblock MO-001", "pm ship MO-001", "pm migrate-ids", "pm new roadmap title"])("routes %s to its handler", async (line) => {
    expect(await run(line.split(" "))).toBe(73);
  });
  it("returns a governance refusal before provisioning", async () => {
    vi.mocked(guard).mockResolvedValueOnce({ refused: 1, contained: false } as Awaited<ReturnType<typeof guard>>);
    expect(await run(["web", "init"])).toBe(1);
    expect(webInit).not.toHaveBeenCalled();
  });
  it("keeps repository-only scaffolding outside the provisioning gate", async () => {
    expect(await run(["web", "init", "--no-provision", "--no-browser", "--project", "example"])).toBe(73);
    expect(guard).not.toHaveBeenCalled();
    expect(webInit).toHaveBeenCalledWith(expect.objectContaining({ project: "example", provision: false, openBrowser: false }));
  });
});
