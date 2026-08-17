import { basename } from "node:path";
import type { AgentError } from "./agent.ts";

export const MACHINE_SCHEMA_VERSION = 1 as const;

export type MachineErrorCode =
  | "INVALID_JSON"
  | "MACHINE_MODE_REQUIRES_BATCH"
  | "MACHINE_MODE_REQUIRES_YES"
  | "SURVEY_NOT_FOUND"
  | "VALIDATION_FAILED";

export type MachineErrorDetail = {
  questionId: string;
  reason: "missing" | "invalid";
  detail?: string;
};

export type MachineSuccessV1 = {
  schemaVersion: typeof MACHINE_SCHEMA_VERSION;
  ok: true;
  surveyId: string;
  responseId: string;
  responsePath: string;
  visited: string[];
};

export type MachineFailureV1 = {
  schemaVersion: typeof MACHINE_SCHEMA_VERSION;
  ok: false;
  surveyId?: string;
  error: {
    code: MachineErrorCode;
    message: string;
    details: MachineErrorDetail[];
  };
  visited?: string[];
};

export type MachineTakeResultV1 = MachineSuccessV1 | MachineFailureV1;

const ERROR_MESSAGES: Record<MachineErrorCode, string> = {
  INVALID_JSON: "Invalid JSON input",
  MACHINE_MODE_REQUIRES_BATCH:
    "Machine output requires --answers or --json batch input",
  MACHINE_MODE_REQUIRES_YES: "Machine output requires --yes",
  SURVEY_NOT_FOUND: "Survey not found",
  VALIDATION_FAILED: "Survey answers failed validation",
};

export function responseIdFromPath(responsePath: string): string {
  const name = basename(responsePath);
  return name.endsWith(".json") ? name.slice(0, -".json".length) : name;
}

export function buildMachineSuccess(args: {
  surveyId: string;
  responsePath: string;
  visited: string[];
}): MachineSuccessV1 {
  return {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    ok: true,
    surveyId: args.surveyId,
    responseId: responseIdFromPath(args.responsePath),
    responsePath: args.responsePath,
    visited: args.visited,
  };
}

export function buildMachineFailure(args: {
  code: MachineErrorCode;
  surveyId?: string;
  details?: MachineErrorDetail[];
  visited?: string[];
  message?: string;
}): MachineFailureV1 {
  const result: MachineFailureV1 = {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    ok: false,
    ...(args.surveyId !== undefined ? { surveyId: args.surveyId } : {}),
    error: {
      code: args.code,
      message: args.message ?? ERROR_MESSAGES[args.code],
      details: args.details ?? [],
    },
    ...(args.visited !== undefined ? { visited: args.visited } : {}),
  };

  return result;
}

export function agentErrorsToDetails(
  errors: AgentError[],
): MachineErrorDetail[] {
  return errors.map((error) => {
    const detail: MachineErrorDetail = {
      questionId: error.questionId,
      reason: error.reason,
    };
    if (error.detail !== undefined) {
      detail.detail = error.detail;
    }
    return detail;
  });
}

export function printMachineResult(result: MachineTakeResultV1): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

export function exitForMachineResult(result: MachineTakeResultV1): never {
  printMachineResult(result);
  process.exit(result.ok ? 0 : 1);
}
