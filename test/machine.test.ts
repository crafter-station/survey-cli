import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const VALID_ANSWERS = {
  role: "dev",
  stack: ["next"],
  biggest_blocker: "this is a long blocker text",
  want_followup: false,
};

const originalHome = process.env.SURVEY_CLI_HOME;
let home: string;

beforeEach(() => {
  home = join(tmpdir(), `survey-cli-machine-test-${crypto.randomUUID()}`);
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

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runCLI(
  args: string[],
  options: { stdin?: string } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "bin/survey.ts", ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SURVEY_CLI_HOME: home,
    },
    stdin: options.stdin !== undefined ? new Blob([options.stdin]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

function responseFiles(): string[] {
  const dir = join(home, "onboarding");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (file) => file.endsWith(".json") && file !== "in-progress.json",
  );
}

function parseStdout(stdout: string): unknown {
  expect(stdout).not.toContain("\u001b");
  return JSON.parse(stdout);
}

describe("machine JSON output (--output json)", () => {
  test("success with --answers --output json --yes emits one ANSI-free envelope and writes response", async () => {
    const result = await runCLI([
      "take",
      "onboarding",
      "--dir",
      "./examples",
      "--answers",
      JSON.stringify(VALID_ANSWERS),
      "--output",
      "json",
      "--yes",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      schemaVersion: number;
      ok: boolean;
      surveyId: string;
      responseId: string;
      responsePath: string;
      visited: string[];
    };

    expect(doc).toEqual({
      schemaVersion: 1,
      ok: true,
      surveyId: "onboarding",
      responseId: doc.responseId,
      responsePath: doc.responsePath,
      visited: doc.visited,
    });
    expect(doc.schemaVersion).toBe(1);
    expect(doc.ok).toBe(true);
    expect(doc.surveyId).toBe("onboarding");
    expect(doc.visited).toEqual([
      "role",
      "stack",
      "biggest_blocker",
      "want_followup",
    ]);
    expect(doc.responsePath).toBe(resolve(doc.responsePath));
    expect(existsSync(doc.responsePath)).toBe(true);
    expect(doc.responseId).toBe(
      doc.responsePath
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? "",
    );
    expect(result.stdout).not.toContain("this is a long blocker text");
    expect(result.stdout).not.toContain('"dev"');
    expect(result.stdout).not.toContain('"next"');
    expect(responseFiles()).toHaveLength(1);
  });

  test("VALIDATION_FAILED emits error envelope and does not write a response", async () => {
    const result = await runCLI([
      "take",
      "onboarding",
      "--dir",
      "./examples",
      "--answers",
      JSON.stringify({ role: "bogus" }),
      "--output",
      "json",
      "--yes",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      schemaVersion: number;
      ok: boolean;
      surveyId: string;
      error: {
        code: string;
        message: string;
        details: Array<{
          questionId: string;
          reason: string;
          detail?: string;
        }>;
      };
      visited: string[];
    };

    expect(doc.schemaVersion).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.surveyId).toBe("onboarding");
    expect(doc.error.code).toBe("VALIDATION_FAILED");
    expect(doc.error.message).toBe("Survey answers failed validation");
    expect(doc.error.details.length).toBeGreaterThan(0);
    expect(doc.error.details[0]?.questionId).toBe("role");
    expect(doc.visited).toContain("role");
    expect(responseFiles()).toHaveLength(0);
  });

  test("INVALID_JSON from --json stdin emits error envelope and does not write", async () => {
    const result = await runCLI(
      [
        "take",
        "onboarding",
        "--dir",
        "./examples",
        "--json",
        "--output",
        "json",
        "--yes",
      ],
      { stdin: "not json" },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      schemaVersion: number;
      ok: boolean;
      surveyId?: string;
      error: { code: string; message: string; details: unknown[] };
      visited?: string[];
    };

    expect(doc.schemaVersion).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.error.code).toBe("INVALID_JSON");
    expect(doc.visited).toBeUndefined();
    expect(responseFiles()).toHaveLength(0);
  });

  test("MACHINE_MODE_REQUIRES_BATCH when --output json has no batch input", async () => {
    const result = await runCLI([
      "take",
      "onboarding",
      "--dir",
      "./examples",
      "--output",
      "json",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      ok: boolean;
      error: { code: string };
      visited?: string[];
    };

    expect(doc.ok).toBe(false);
    expect(doc.error.code).toBe("MACHINE_MODE_REQUIRES_BATCH");
    expect(doc.visited).toBeUndefined();
  });

  test("MACHINE_MODE_REQUIRES_YES when --output json lacks --yes", async () => {
    const result = await runCLI([
      "take",
      "onboarding",
      "--dir",
      "./examples",
      "--answers",
      JSON.stringify(VALID_ANSWERS),
      "--output",
      "json",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      ok: boolean;
      error: { code: string };
      visited?: string[];
    };

    expect(doc.ok).toBe(false);
    expect(doc.error.code).toBe("MACHINE_MODE_REQUIRES_YES");
    expect(doc.visited).toBeUndefined();
    expect(responseFiles()).toHaveLength(0);
  });

  test("SURVEY_NOT_FOUND emits error envelope and does not write", async () => {
    const result = await runCLI([
      "take",
      "nosuch",
      "--dir",
      "./examples",
      "--answers",
      JSON.stringify(VALID_ANSWERS),
      "--output",
      "json",
      "--yes",
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toContain("\u001b");

    const doc = parseStdout(result.stdout) as {
      schemaVersion: number;
      ok: boolean;
      surveyId: string;
      error: { code: string };
      visited?: string[];
    };

    expect(doc.schemaVersion).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.surveyId).toBe("nosuch");
    expect(doc.error.code).toBe("SURVEY_NOT_FOUND");
    expect(doc.visited === undefined || doc.visited.length === 0).toBe(true);
    expect(responseFiles()).toHaveLength(0);
  });

  test("machine mode stderr has no Clack/ANSI output", async () => {
    const result = await runCLI([
      "take",
      "onboarding",
      "--dir",
      "./examples",
      "--answers",
      JSON.stringify(VALID_ANSWERS),
      "--output",
      "json",
      "--yes",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("\u001b");
    expect(
      result.stderr.trim() === "" || !result.stderr.includes("\u001b"),
    ).toBe(true);
  });
});
