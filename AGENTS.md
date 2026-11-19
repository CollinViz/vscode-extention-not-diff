# Review Surface — agent notes

VS Code extension (`review-surface`). Bundle entry is `src/extension.ts` → `dist/extension.js`. Node `>=20`, `engines.vscode` `^1.90.0`.

`instruction.md` and `start.md` are the original build plan. They are **stale** on default scope and reviewed-state. Trust `src/`, `package.json`, and `README.md`. `maybeToDo.md` is research, not a spec.

## Commands

`npm run compile` is `tsc --noEmit`. It does not produce the extension. The host loads `dist/extension.js` from `npm run build` (`esbuild`, CJS, `vscode` external).

```bash
npm run compile          # strict typecheck of src/ only
npm run lint
npm run build            # required before the extension or integration tests run
npm run test:unit        # Vitest. One file: npx vitest run test/unit/Foo.test.ts
npm run test:integration # build + tsc to out-test/ + real Extension Host
npm run check            # compile → lint → build → unit → integration. This is the gate.
```

There is no `.vscode/launch.json`. README's F5 claim is not wired in this repo.

Integration tests download VS Code into `.vscode-test/` via `@vscode/test-electron` and need `git` on `PATH`. `test/integration/index.ts` has a **manual** `SUITE_FILES` list — a new `test/integration/suite/*.test.ts` does not run until it is added there. There is no single-file integration script. `runTest.ts` sets `REVIEW_SURFACE_TEST=1` before launch; without that, the test-only commands are not registered.

## Architecture (do not blur layers)

| Layer | May import `vscode`? | Role |
| --- | --- | --- |
| `src/config/` | no (`constants.ts`, `identifiers.ts`, `defaults.ts`) | named constants and IDs only |
| `src/domain/`, `src/application/`, `src/util/` | **no** — ESLint `no-restricted-imports` on domain + application | pure logic, ports, path/URI/error helpers |
| `src/infrastructure/` | yes | port adapters. Git, fs, clock, repo discovery |
| `src/presentation/` | yes | tree, decorations, commands, content provider |
| `src/extension.ts` | yes | **only** composition root |

Unit tests must not import `vscode`. Inject fakes (`test/unit/helpers/`).

## SOLID, DRY, no magic numbers

These are linted and reviewed, not slogans.

- **SOLID.** Domain does not know VS Code. Infrastructure implements ports in `src/domain/ports.ts`. Application orchestrates. Presentation adapts `vscode.*`. Do not grow `extension.ts` into a service; wire it and stop.
- **DRY.** One diff parser (`DiffHunkParser`), one tree builder (`FileTreeBuilder`, including the file sort), one Git argv builder (`src/infrastructure/gitArguments.ts`), one path normalizer (`src/util/paths.ts`), one URI codec (`src/util/reviewUri.ts`), one error formatter (`src/util/errors.ts`). Tests import production code; do not reimplement it.
- **No magic numbers / duplicated IDs.** `@typescript-eslint/no-magic-numbers` is `error` on `src/**` except `src/config/**` (only `0`, `1`, `-1` are ignored). New timeouts, alphas, counts, and offsets go in `src/config/constants.ts`. Command, view, context, config, and scheme strings live in `src/config/identifiers.ts`. `package.json` cannot import TypeScript, so each contributed ID exists in exactly two places: `package.json` and `identifiers.ts` (menu `when` clauses may repeat the context-key string). No third copy in logic. Tests import the constants; do not hard-code `10`, `GIT_EMPTY_TREE_HASH`, or command IDs.

A new user command needs all of: `identifiers.ts`, `package.json` `contributes.commands`, a matching `activationEvents` `onCommand:…` entry, `CommandRegistrar`, and any menu/`when` clause. Missing `onCommand` means integration tests that execute the command never activate the extension.

## Product rules agents undo by accident

- Default scope is `{ kind: 'branch' }` (`defaultReviewScope()`), not last-N. Base is merge-base against `BASE_BRANCH_CANDIDATES` (`origin/master`, `origin/main`, `master`, `main`). Branch scope must **not** widen to the branch's own upstream — that pulls base-branch history back in. Last-N and date-range still widen for unpushed commits.
- Clicking a file opens the normal editor, read-only. Do not open a diff editor unless the user asks (hover link, line-number menu, editor title, `Alt+D`).
- Git is `child_process.execFile` / `execFileSync` with an argument array. Never `exec`, never `shell: true`, never a shell string.
- "Reviewed" is session-only (`MemoryReviewStateStore`). Do not persist it, and do not filter it out of the Git file list. The list is Git reality; reviewed is a mark on top.
- Test-only commands (`review-surface.internal.getSnapshot`, `.getTree`, `.setScope`) register only when `process.env[TEST_ENV_VAR] === TEST_ENV_ENABLED`. Do not contribute them in `package.json`. Integration tests set scope through that seam, not through quick-input prompts.
