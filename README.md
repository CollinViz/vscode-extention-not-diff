# Review Surface

A VS Code extension that gives you a single, unified, live review surface for Git
changes across every repository in your workspace.

Instead of opening side-by-side diffs, you inspect the **current working code in
context** — changed lines carry a high-visibility background tint — starting in
a safe **read-only** posture. Flip to edit mode with `Alt+R` whenever you need
to type; highlights stay on.

- **One Changed Files view** for all repos (pruned directory tree + flat-list toggle)
- **Per-file `+adds / -dels` counts** and a **session-only “Reviewed” toggle**
  (right-click a file → *Toggle Reviewed*, or *Mark All Reviewed* / *Clear
  Reviewed State* from the command palette — nothing is persisted)
- **Current branch scope by default** (base = merge-base with `origin/master`/`main`/…),
  plus Last-N and date-range scopes; staged, unstaged, untracked and unpushed
  changes are always included
- **Diff escape hatches**: hover the highlighted lines, right-click the line
  number, or press `Alt+D` — a traditional diff opens only when you ask for it

## Develop

```bash
npm install
npm run compile   # strict typecheck
npm run lint      # eslint
npm run build     # bundle to dist/
npm run test:unit # fast Vitest suite (no VS Code)
npm run test:integration  # real Extension Host + real git repos
npm run check     # everything above in order
```

Press `F5` in VS Code to launch the Extension Development Host.

## License

MIT — see [LICENSE](./LICENSE).
