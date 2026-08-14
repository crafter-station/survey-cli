import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AmbiguousResponsePrefixError,
  clearInProgress,
  deleteResponse,
  discoverSurveyFiles,
  listResponses,
  loadInProgress,
  loadSurveyById,
  readResponse,
  saveInProgress,
  saveResponse,
} from "../src/storage.ts";

const originalHome = process.env.SURVEY_CLI_HOME;
const originalCwd = process.cwd();
let home: string;

beforeEach(() => {
  home = join(tmpdir(), `survey-cli-test-${crypto.randomUUID()}`);
  process.env.SURVEY_CLI_HOME = home;
  setSystemTime(new Date("2026-04-30T06:00:00.000Z"));
});

afterEach(() => {
  process.chdir(originalCwd);
  setSystemTime();
  if (originalHome === undefined) {
    delete process.env.SURVEY_CLI_HOME;
  } else {
    process.env.SURVEY_CLI_HOME = originalHome;
  }
  rmSync(home, { force: true, recursive: true });
});

describe("storage", () => {
  test("saveResponse writes JSON and returns path", () => {
    const path = saveResponse("onboarding", { role: "dev" });
    const saved = JSON.parse(readFileSync(path, "utf8"));

    expect(path).toContain("2026-04-30T06-00-00-000Z.json");
    expect(saved).toEqual({
      surveyId: "onboarding",
      timestamp: "2026-04-30T06-00-00-000Z",
      answers: { role: "dev" },
    });
  });

  test("saveInProgress and loadInProgress roundtrip", () => {
    saveInProgress("onboarding", { role: "dev" }, "stack");

    expect(loadInProgress("onboarding")).toMatchObject({
      surveyId: "onboarding",
      answers: { role: "dev" },
      inProgress: true,
      lastQuestionId: "stack",
    });
  });

  test("clearInProgress removes file", () => {
    const path = saveInProgress("onboarding", { role: "dev" }, "stack");

    clearInProgress("onboarding");

    expect(existsSync(path)).toBe(false);
    expect(loadInProgress("onboarding")).toBeNull();
  });

  test("listResponses skips in-progress.json", () => {
    saveResponse("onboarding", { role: "dev" });
    saveInProgress("onboarding", { role: "founder" }, "stack");

    expect(listResponses("onboarding")).toHaveLength(1);
    expect(listResponses("onboarding")[0]?.answers).toEqual({ role: "dev" });
  });

  test("deleteResponse removes a uniquely matching saved response", () => {
    const path = saveResponse("onboarding", { role: "dev" });

    const deleted = deleteResponse("onboarding", "2026-04-30T06-00");

    expect(deleted?.timestamp).toBe("2026-04-30T06-00-00-000Z");
    expect(existsSync(path)).toBe(false);
    expect(deleteResponse("onboarding", "missing")).toBeNull();
  });

  test("readResponse resolves an exact timestamp and a unique prefix", () => {
    const dir = join(home, "onboarding");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "2026-04-30T06-00-00-000Z.json"),
      JSON.stringify({
        surveyId: "onboarding",
        timestamp: "2026-04-30T06-00-00-000Z",
        answers: { role: "dev" },
      }),
    );

    expect(
      readResponse("onboarding", "2026-04-30T06-00-00-000Z")?.timestamp,
    ).toBe("2026-04-30T06-00-00-000Z");
    expect(readResponse("onboarding", "2026-04-30T06-00")?.timestamp).toBe(
      "2026-04-30T06-00-00-000Z",
    );
  });

  test("readResponse returns null for a missing prefix and an absent survey", () => {
    const dir = join(home, "onboarding");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "2026-04-30T06-00-00-000Z.json"),
      JSON.stringify({
        surveyId: "onboarding",
        timestamp: "2026-04-30T06-00-00-000Z",
        answers: {},
      }),
    );

    expect(readResponse("onboarding", "2026-05")).toBeNull();
    expect(readResponse("never-created", "2026-04")).toBeNull();
  });

  test("readResponse rejects ambiguous prefixes without modifying either response", () => {
    const dir = join(home, "onboarding");
    mkdirSync(dir, { recursive: true });
    const first = join(dir, "2026-04-30T06-00-00-000Z.json");
    const second = join(dir, "2026-04-30T06-00-30-000Z.json");
    const payload = (timestamp: string) =>
      JSON.stringify({ surveyId: "onboarding", timestamp, answers: {} });
    writeFileSync(first, payload("2026-04-30T06-00-00-000Z"));
    writeFileSync(second, payload("2026-04-30T06-00-30-000Z"));
    const before = [readFileSync(first, "utf8"), readFileSync(second, "utf8")];

    let thrown: unknown;
    try {
      readResponse("onboarding", "2026-04-30T06-00");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AmbiguousResponsePrefixError);
    expect((thrown as AmbiguousResponsePrefixError).matches).toEqual([
      "2026-04-30T06-00-00-000Z",
      "2026-04-30T06-00-30-000Z",
    ]);
    expect([readFileSync(first, "utf8"), readFileSync(second, "utf8")]).toEqual(
      before,
    );
  });

  test("readResponse ignores corrupt timestamp metadata, matching deleteResponse", () => {
    // The filename is the authoritative identity in deleteResponse; show must
    // agree, or `show <prefix>` and `delete <prefix>` resolve differently.
    const dir = join(home, "onboarding");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "2026-04-30T06-00-00-000Z.json"),
      JSON.stringify({
        surveyId: "onboarding",
        timestamp: "1999-01-01T00-00-00-000Z",
        answers: {},
      }),
    );

    expect(readResponse("onboarding", "2026-04-30T06-00")?.timestamp).toBe(
      "2026-04-30T06-00-00-000Z",
    );
  });

  test("deleteResponse rejects ambiguous prefixes without deleting either response", () => {
    const dir = join(home, "onboarding");
    mkdirSync(dir, { recursive: true });
    const first = join(dir, "2026-04-30T06-00-00-000Z.json");
    const second = join(dir, "2026-04-30T06-00-30-000Z.json");
    const payload = (timestamp: string) =>
      JSON.stringify({ surveyId: "onboarding", timestamp, answers: {} });
    writeFileSync(first, payload("2026-04-30T06-00-00-000Z"));
    writeFileSync(second, payload("2026-04-30T06-00-30-000Z"));

    expect(() => deleteResponse("onboarding", "2026-04-30T06-00")).toThrow(
      AmbiguousResponsePrefixError,
    );
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  test("deleteResponse ignores corrupt timestamp metadata when choosing the unlink path", () => {
    const surveyPath = join(home, "onboarding");
    mkdirSync(surveyPath, { recursive: true });
    const responseTimestamp = "2026-04-30T06-00-00-000Z";
    const corruptPath = join(surveyPath, `${responseTimestamp}.json`);
    const outsidePath = join(home, "target.json");

    writeFileSync(
      corruptPath,
      JSON.stringify({
        surveyId: "onboarding",
        timestamp: "../target",
        answers: { role: "dev" },
      }),
    );
    writeFileSync(outsidePath, "must survive");

    const deleted = deleteResponse("onboarding", responseTimestamp);

    expect(deleted?.timestamp).toBe(responseTimestamp);
    expect(existsSync(corruptPath)).toBe(false);
    expect(existsSync(outsidePath)).toBe(true);
    expect(readFileSync(outsidePath, "utf8")).toBe("must survive");
  });

  test("discoverSurveyFiles finds TypeScript and ESM survey files", () => {
    const dir = join(home, "surveys");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "first.ts"), "export default {};");
    writeFileSync(join(dir, "second.mjs"), "export default {};");
    writeFileSync(join(dir, "ignore.txt"), "");

    expect(
      discoverSurveyFiles(dir)
        .map((file) => file.split("/").pop())
        .sort(),
    ).toEqual(["first.ts", "second.mjs"]);
  });

  test("discoverSurveyFiles warns when falling back to examples", () => {
    const examplesDir = join(home, "examples");
    mkdirSync(examplesDir, { recursive: true });
    writeFileSync(join(examplesDir, "example.ts"), "export default {};");
    process.chdir(home);

    const error = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(discoverSurveyFiles()).toEqual([join("./examples", "example.ts")]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        "Warning: ./surveys not found; falling back to ./examples.",
      );
    } finally {
      error.mockRestore();
    }
  });

  test("loadSurveyById returns matching survey", async () => {
    const dir = join(home, "surveys");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "onboarding.ts"),
      'export default { id: "onboarding", title: "Onboarding", questions: [] };',
    );

    await expect(loadSurveyById("onboarding", dir)).resolves.toMatchObject({
      id: "onboarding",
      title: "Onboarding",
      questions: [],
    });
    await expect(loadSurveyById("missing", dir)).resolves.toBeNull();
  });
});
