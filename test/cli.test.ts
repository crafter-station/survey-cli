import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { buildProgram } from "../src/cli.ts";

const originalHome = process.env.SURVEY_CLI_HOME;
let home: string;

beforeEach(() => {
  home = join(tmpdir(), `survey-cli-command-test-${crypto.randomUUID()}`);
  process.env.SURVEY_CLI_HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.SURVEY_CLI_HOME;
  } else {
    process.env.SURVEY_CLI_HOME = originalHome;
  }
  rmSync(home, { recursive: true, force: true });
});

function writeResponse(
  filename: string,
  timestamp: string,
  answers: Record<string, unknown> = { role: "dev" },
): string {
  const dir = join(home, "onboarding");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(
    path,
    JSON.stringify({ surveyId: "onboarding", timestamp, answers }, null, 2),
  );
  return path;
}

async function runCli(...args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const root = join(import.meta.dir, "..");
  const proc = Bun.spawn(
    [process.execPath, join(root, "bin", "survey.ts"), ...args],
    {
      cwd: root,
      env: { ...process.env, SURVEY_CLI_HOME: home },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

describe("buildProgram", () => {
  test("returns a commander command", () => {
    expect(buildProgram()).toBeInstanceOf(Command);
  });

  test("registers expected subcommands", () => {
    const names = buildProgram().commands.map((command) => command.name());

    expect(names).toContain("new");
    expect(names).toContain("list");
    expect(names).toContain("schema");
    expect(names).toContain("take");
    expect(names).toContain("responses");
  });

  test("documented responses show syntax reaches the show action", async () => {
    writeResponse("2026-04-30T06-00-00-000Z.json", "2026-04-30T06-00-00-000Z");
    const log = spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await buildProgram().parseAsync([
        "node",
        "survey",
        "responses",
        "onboarding",
        "show",
        "2026-04-30T06-00",
      ]);

      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toContain('"role": "dev"');
    } finally {
      log.mockRestore();
    }
  });

  test("responses show exits non-zero for a missing timestamp", async () => {
    const result = await runCli(
      "responses",
      "onboarding",
      "show",
      "2026-04-30T06-00",
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not found");
  });

  test("responses show rejects an ambiguous prefix and leaves every match intact", async () => {
    const firstTimestamp = "2026-04-30T06-00-00-000Z";
    const secondTimestamp = "2026-04-30T06-00-30-000Z";
    const first = writeResponse(`${firstTimestamp}.json`, firstTimestamp, {
      role: "dev",
    });
    const second = writeResponse(`${secondTimestamp}.json`, secondTimestamp, {
      role: "founder",
    });

    const result = await runCli(
      "responses",
      "onboarding",
      "show",
      "2026-04-30T06-00",
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Ambiguous response timestamp: 2026-04-30T06-00");
    expect(result.stderr).toContain(firstTimestamp);
    expect(result.stderr).toContain(secondTimestamp);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  test("documented responses delete syntax deletes the response", async () => {
    const path = writeResponse(
      "2026-04-30T06-00-00-000Z.json",
      "2026-04-30T06-00-00-000Z",
    );
    const log = spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await buildProgram().parseAsync([
        "node",
        "survey",
        "responses",
        "onboarding",
        "delete",
        "2026-04-30T06-00",
      ]);

      expect(existsSync(path)).toBe(false);
      expect(log).toHaveBeenCalledWith("Deleted 2026-04-30T06-00-00-000Z");
    } finally {
      log.mockRestore();
    }
  });
});
