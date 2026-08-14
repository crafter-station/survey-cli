# Project North

Updated: 2026-08-14

## Product promise

`survey-cli` lets developers collect validated, structured answers from humans and agents inside local terminal workflows without requiring a backend.

## Current evidence

- Interactive and agent batch modes already share the same TypeScript survey definition, branching, and Zod validation.
- Agent batch mode accepts JSON, but successful submissions still render a human-oriented summary and an unstructured filesystem path.
- Responses remain on disk and can be exported as JSON or CSV, which makes local ownership a real product constraint rather than positioning copy.
- Recent contributor work expanded the local response lifecycle before there was evidence for a hosted product.

## Direction bets

1. Make the CLI a stable local protocol for both human and agent submissions, beginning with deterministic machine-readable output.
2. Keep agent workflows explicit and composable around the existing CLI instead of embedding model providers or remote services.

## Non-goals

- A hosted backend, account system, or web dashboard without validated demand for shared or remote collection.
- An AI form builder or natural-language survey authoring in the core CLI.
- Persistent multi-turn agent sessions before the stateless batch protocol is reliable.
- Response analytics, import, or synchronization inside the machine-output slice.

## Decision rules

- Every feature issue must produce one observable CLI outcome and remain independently mergeable and revertible.
- Machine contracts must be explicit, versioned, parseable, and covered by exact output tests.
- Human-facing behavior remains the default unless a user explicitly selects machine output.
- New work must preserve local storage, avoid telemetry, and avoid requiring a backend.
- Adjacent cleanup and future platform work do not enter an active slice.

## Success signals

- An agent can submit answers and parse one deterministic result that identifies the saved response.
- Validation and usage failures return structured output with a non-zero exit status.
- Existing interactive and human batch workflows retain their current behavior.
- Contributors can implement and verify protocol improvements without learning an external service.

## Open questions

- What real workflow would justify incremental agent sessions after stateless submission is stable?
- Which portability need, import, synchronization, or sharing, appears first in user evidence?
- What evidence would justify revisiting the hosted roadmap?
