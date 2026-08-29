import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MORPHEUS_BOOTSTRAP,
  MORPHEUS_SESSION_START,
  bootstrapScript,
  sessionStartScript,
} from "../src/session/bootstrap.js";

const runFile = promisify(execFile);

describe("version-independent Morpheus bootstrap", () => {
  let dir: string;
  let bin: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "morpheus-bootstrap-test-"));
    bin = join(dir, "bin");
    await mkdir(join(dir, ".morpheus"), { recursive: true });
    await mkdir(bin, { recursive: true });
    await writeFile(join(dir, MORPHEUS_BOOTSTRAP), bootstrapScript());
    await writeFile(join(dir, MORPHEUS_SESSION_START), sessionStartScript());
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const executable = async (name: string, source: string): Promise<void> => {
    const path = join(bin, name);
    await writeFile(path, source);
    await chmod(path, 0o700);
  };

  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    ...process.env,
    HOME: join(dir, "home"),
    PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`,
    ...extra,
  });

  it("turns a pre-self CLI into the exact consent instruction", async () => {
    await executable("morpheus", '#!/bin/sh\nprintf \'Unknown command "self"\\n\' >&2\nexit 1\n');

    const { stdout, stderr } = await runFile("sh", [MORPHEUS_SESSION_START], {
      cwd: dir,
      env: env(),
    });

    expect(stderr).toBe("");
    expect(stdout).toContain("Morpheus bootstrap required.");
    expect(stdout).toContain(
      'Ask the user exactly: "Morpheus is stale. Enable automatic updates after pulls on this device?"',
    );
    expect(stdout).toContain("If yes, run: sh .morpheus/bootstrap.sh enable");
    expect(stdout).toContain("Do not infer consent.");
  });

  it("keeps the normal brief path when the installed CLI supports auto-update", async () => {
    await executable(
      "morpheus",
      '#!/bin/sh\nif [ "$*" = "self auto-update status" ]; then exit 0; fi\nif [ "$*" = "context brief" ]; then printf \'brief-ok\\n\'; exit 0; fi\nexit 1\n',
    );

    const { stdout } = await runFile("sh", [MORPHEUS_SESSION_START], {
      cwd: dir,
      env: env(),
    });

    expect(stdout).toBe("brief-ok\n");
    expect(stdout).not.toContain("bootstrap required");
  });

  it("records no without installing or calling the stale CLI", async () => {
    const staleLog = join(dir, "stale.log");
    const config = join(dir, "device", "auto-update.json");
    await executable("morpheus", `#!/bin/sh\nprintf called >> "${staleLog}"\nexit 1\n`);

    const { stdout } = await runFile("sh", [MORPHEUS_BOOTSTRAP, "disable"], {
      cwd: dir,
      env: env({ MORPHEUS_AUTO_UPDATE_CONFIG: config }),
    });

    expect(stdout).toContain("automatic updates are disabled");
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      schema: 1,
      enabled: false,
    });
    await expect(readFile(staleLog, "utf8")).rejects.toThrow();
  });

  it("installs and enables through the freshly cloned CLI, never the stale binary", async () => {
    const commandLog = join(dir, "commands.log");
    const staleLog = join(dir, "stale.log");
    const prefix = join(dir, "npm-prefix");
    const scratch = join(dir, "scratch");
    await mkdir(scratch, { recursive: true });

    await executable(
      "git",
      '#!/bin/sh\nlast=""\nfor arg in "$@"; do last="$arg"; done\nmkdir -p "$last/dist/cli"\nprintf \'// committed cli\\n\' > "$last/dist/cli/index.js"\nexit 0\n',
    );
    await executable(
      "node",
      '#!/bin/sh\nif [ "$1" = "-p" ]; then printf \'22\\n\'; exit 0; fi\nprintf \'node|%s|%s\\n\' "$PWD" "$*" >> "$MORPHEUS_TEST_LOG"\nexit 0\n',
    );
    await executable(
      "npm",
      '#!/bin/sh\nif [ "$1" = "prefix" ] && [ "$2" = "--global" ]; then printf \'%s\\n\' "$MORPHEUS_TEST_PREFIX"; exit 0; fi\nexit 1\n',
    );
    await executable(
      "pnpm",
      '#!/bin/sh\nprintf \'pnpm|%s|%s\\n\' "$PWD" "$*" >> "$MORPHEUS_TEST_LOG"\nexit 0\n',
    );
    await executable("morpheus", `#!/bin/sh\nprintf called >> "${staleLog}"\nexit 1\n`);

    const { stdout } = await runFile("sh", [MORPHEUS_BOOTSTRAP, "enable"], {
      cwd: dir,
      env: env({
        MORPHEUS_TEST_LOG: commandLog,
        MORPHEUS_TEST_PREFIX: prefix,
        TMPDIR: scratch,
      }),
    });

    const commands = await readFile(commandLog, "utf8");
    expect(commands).toContain("pnpm|");
    expect(commands).toContain("|install --frozen-lockfile");
    expect(commands.indexOf("pnpm|")).toBeLessThan(commands.indexOf("node|"));
    expect(commands).toContain("dist/cli/index.js self install");
    expect(commands).toContain("dist/cli/index.js registry add");
    expect(commands).toContain("dist/cli/index.js self auto-update enable");
    expect(commands).toContain(`node|${await realpath(dir)}|`);
    expect(stdout).toContain("Installed current Morpheus and enabled automatic updates");
    await expect(readFile(staleLog, "utf8")).rejects.toThrow();
  });
});
