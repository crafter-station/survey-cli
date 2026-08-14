# @crafter/survey-cli

[![survey-cli hero](.github/assets/hero.jpeg)](https://survey-cli.crafter.run)

Run surveys from your terminal. Agent-friendly, type-safe, OSS.

```bash
bunx @crafter/survey-cli take onboarding
```

## Install

```bash
bun add -g @crafter/survey-cli
# or run ad-hoc:
bunx @crafter/survey-cli <cmd>
```

## Define a survey

```ts
// surveys/onboarding.ts
import { defineSurvey, q } from "@crafter/survey-cli/define"
import { z } from "zod"

export default defineSurvey({
  id: "onboarding",
  title: "Welcome",
  questions: [
    q.select("role", "Role?", ["dev", "designer", "founder"]),
    q.multiselect("stack", "Stack?", ["next", "astro", "remix"]),
    q.text("blocker", "Biggest blocker?", { schema: z.string().min(10) }),
    q.confirm("followup", "Want followup?", {
      next: (a) => a.followup ? "email" : null,
    }),
    q.text("email", "Email?", {
      schema: z.string().email(),
      skipIf: (a) => !a.followup,
    }),
  ],
})
```

Type-safe end-to-end. Branching via `next()`. Validation via Zod. No DSL.

## Commands

```bash
survey new <id>                        # create surveys/<id>.ts starter scaffold
survey list                            # list surveys in ./surveys
survey schema <id>                     # print survey schema as JSON
survey take <id>                       # interactive (humano en TTY)
survey take <id> --answers '{...}'     # agent batch
echo '{...}' | survey take <id> --json # agent batch via stdin
survey take <id> --yes                 # skip summary confirm
survey responses <id>                  # list saved responses
survey responses <id> --export csv     # export all to CSV
survey responses <id> show <ts>        # show one response by timestamp
survey responses <id> delete <ts>      # delete one response by timestamp
```

Responses persist to `~/.survey-cli/<survey-id>/<timestamp>.json`. Override with `SURVEY_CLI_HOME=/path`.

## Three modes

| Mode | When | How |
|---|---|---|
| **Interactive** | Humano en TTY | `survey take <id>` |
| **Agent batch** | Pipeline / IA agent / CI | `survey take <id> --answers '{...}'` |
| **Resume** | Cancelaste a la mitad | `survey take <id>` (auto-detecta in-progress) |

## Roadmap (skills — deferred)

The following Claude Code skills are deferred and are not part of the current release:

- `/survey-create` — generate `defineSurvey({...})` from a prompt ("post-event feedback, 6 questions")
- `/survey-fill` — agent fills `--answers` from local context (CLAUDE.md, env, vault) and submits

Track in [issues](https://github.com/crafter-station/survey-cli/issues).

## Roadmap (product)

V1 (current) is local-first, with no backend and JSON storage.
The current direction is a stable protocol for human and agent submissions. See
[NORTH.md](./NORTH.md) and the selected
[agent machine output shape](./docs/shaping/agent-machine-output.md).

## License

MIT © Railly Hugo
