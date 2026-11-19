# MaybeToDo — Diff review research: Codex, the AI ecosystem, and Review Surface gaps

Date: 2026-11-19
Context: Review Surface v0.2.2 (diff-editor theme colors, contiguous gutter bar, F7/Shift+F7
navigation, multi-repo tree, merge-base branch scope, read-only by default with Alt+R edit toggle).

---

## 1. What people actually love about Codex's diff experience

### Codex desktop app (the praise-magnet)

- **Diff view + comment on the diff** — "review the agent's changes in the thread, comment on
  the diff, even open it in your editor to make manual changes." Most-quoted dev-blog line:
  *"A diff view that makes it really easy to see what's changed… a button to open changes in
  your preferred IDE."*
- **Worktrees built in** — parallel agents on isolated copies of the repo, so review is
  per-thread and never fights your dirty tree.
- **Review queue for Automations** — scheduled agent runs land finished work in a queue for
  human review. Review becomes *a place you visit*, not an interruption.
- **Chat and code on the same screen** — one detailed reviewer concluded the app wins
  specifically for "work where you want to check diffs as you go," and that its role is an
  "AI agent management dashboard" with actual editing in the normal editor. That is almost
  exactly Review Surface's thesis.

### Codex CLI (and its pain points — instructive)

- Users loved v0.98's **colorized diff + permission request in the same reply** — the diff was
  a "visual anchor" you could scroll back to. When it was downgraded in 0.101, people
  reverted versions.
- Newest praised change: *"while an approval prompt is open, you can now expand the patch
  details right there in the transcript. **If I have to leave the prompt to see what I'm
  approving, I'll end up just hitting yes.**"*
- Loudest complaints:
  - approval widget shows only **3 lines at a time**, no expand/fullscreen
  - `View all changes` in the IDE extension only appears **after** you accept
  - `/diff` is a static pager — no file list, no per-file counts, no preview pane
    (issue #18149 proposes exactly the two-pane explorer our tree already is)

### Codex code review (GPT-5-Codex)

- Model trained specifically to review: matches stated intent against the diff, navigates
  dependencies, runs code and tests, posts findings on PRs, steerable via
  `@codex review for security vulnerabilities`. OpenAI says it reviews most of their
  internal PRs.

### Best cross-tool dataset (feedbackbench — "change review UX", 74 user-weeks, all major agents)

Top complaints across *all* agents:

1. **Too much change to check** (24% of complaining user-weeks)
2. **Diff panel missing/stale/out of sync** (agents' own changed-files lists break)
3. **Keep/undo controls that fail or act on their own**
4. **No per-hunk accept/reject/edit** — all-or-nothing approval
5. **Diff compared against the wrong baseline** (hardcoded main, all-git-changes instead of
   last turn, wrong worktree, ignores submodules)
6. **Edits made outside the tracked tool** (shell/sed/scripts) never appear in the diff

---

## 2. What the wider AI+diff ecosystem is converging on

Every serious tool has landed on the same loop:

**agent changes → human annotates lines on a readable diff → structured findings flow back
to the agent → it fixes → re-review.**

- **Claude Code (VS Code)**: side-by-side diff *before* anything is written; **per-change
  Accept/Reject buttons under each hunk** (v2.1.275+) plus accept/reject at cursor;
  **plan mode** opens the plan as a markdown doc you annotate inline before code is written;
  **checkpoints/rewind** ("the standout feature"); and the underrated fourth button —
  **"Tell Claude what to do instead."**
- **GitHub Copilot (VS Code Agents window)**: pending-edits working set with **Keep/Undo per
  change, per file, or all**; select a range in the diff → inline comment → **Submit
  Feedback** sends batched comments to the agent, which resolves them; experimental PR
  comment publishing.
- **Cursor**: per-hunk accept/reject is table stakes; users say they "keep Cursor only to
  check changes made by other agents before they commit."
- **Aider**: git *is* the review surface — auto-commit per edit, `/diff`, `/undo`, dirty
  commits to isolate pre-existing work. Diffs become commits you can bisect.
- **Continue.dev**: inline accept/reject hunks in the editor gutter.
- **CodeRabbit (IDE extension)**: line-level findings on **uncommitted changes** (pre-PR),
  severity labels, **"Fix with AI"** hands a finding to your choice of agent (Claude Code,
  Codex, **opencode**, Cursor…), incremental re-review of only what changed since last
  review, scope picking (all / committed / uncommitted vs a base branch).
- **norrin** (marketplace): gives vanilla VS Code Cursor-style red/green inline diffs of
  Claude Code edits with CodeLens Accept/Reject above each block, accept file, accept all.

**The common thread: the diff is becoming a bidirectional channel, not a read-only view.**
Ours is currently read-only in both senses — safe posture, but also a dead end for
communication.

---

## 3. Where Review Surface stands — and the gaps

### What we already nail (and people beg Codex for)

- Reviewing **in the real editor** at full size — the #1 Codex complaint ("3 lines at a
  time") is our core design. ✓
- **Working code in context** instead of side-by-side abstraction — matches how people say
  they actually want to review. ✓
- **Multi-repo unified surface** — almost nobody does this well; the Codex app only just
  added "review changes across multiple code repositories." ✓
- Diff escape hatches instead of forced side-by-side. ✓
- Merge-base branch scope is *more correct* than several of these tools (wrong-baseline is a
  top-6 complaint industry-wide). ✓

### The gaps, ranked by how much the market clearly wants them

1. **No feedback loop back to an agent.** The industry's converged killer feature and we
   have nothing. Minimal version: select lines → add a comment → "Copy review comments as
   Markdown" or send to a running agent session. Valuable even without AI (human PR notes).
2. **No per-hunk/file keep-undo.** Ours is deliberately read-only for human changes, which is
   fine — but to sit in the agent loop (like Copilot's working set or norrin), per-hunk
   accept/reject with a snapshot baseline is the pattern. Reference implementation:
   `opencode-diff-review`'s snapshot-before-write design.
3. **No reviewed-state tracking.** We explicitly dropped mark-as-reviewed — but every serious
   review UI (Codex app, plannotator, opencode-diffs) has "collapse and mark file as viewed."
   For a 40-file multi-repo review, "what haven't I looked at yet" is the real navigation
   problem. Worth revisiting as **session-only** (non-persisted) state, which keeps the
   original no-metadata rule.
4. **No agent attribution.** We can't distinguish "you wrote this" from "OpenCode wrote this
   30 seconds ago." Aider solves it with dirty-commits before AI edits; CodeRabbit reviews
   committed vs uncommitted separately. Even a "changed since the agent started" toggle
   would be a differentiator.
5. **No per-file +/− counts or progress affordances in the tree.** Codex issue #18149's whole
   ask is a file list with counts and fast file-to-file navigation — our tree could show
   `+18 −2` per node cheaply.
6. **No semantic chunking or AI reviewer.** code-stroll groups hunks semantically and walks
   you through one at a time with Q&A; CodeRabbit / oh-my-review-experts add AI findings.
   Later-stage ideas — the feedback loop comes first.
7. **Scroll-position stability** — a real Codex app complaint (resets when switching files).
   Our F7/Shift+F7 navigation should preserve context; worth an explicit test.

---

## 4. OpenCode plugins that already exist (the space is crowded)

| Plugin | What it does |
|---|---|
| **`opencode-diff-review`** (wuwei-apc) | Snapshots files *before* the AI writes, then IDEA-style side-by-side review with **hunk/line/file-level agree-disagree and revert** — doesn't even need git. Closest to Copilot's working-set model. `ctrl+shift+r` / `/diff-review`. |
| **`opencode-diffs`** (oorestisime) | `/diff-review` opens a browser UI (via @pierre/diffs); annotate lines with category/severity/comments; **findings return to the OpenCode session as structured data**; multi-round with carry-over; `--base`, `--files` flags. |
| **`opencode-diff-feedback`** | TUI plugin: rejected diffs captured, **line-by-line comments sent back to the agent as a markdown follow-up**. Requires permissions set to ask before write/edit. |
| **`@plannotator/opencode`** | Browser review surface across many agents (OpenCode, Codex, Claude, Copilot CLI, Gemini CLI, Amp…); annotate diffs, suggest code, feedback goes back to the agent; guided "chapters" for big diffs; works with Git, GitButler, Jujutsu, Perforce. |
| **`code-stroll`** | Semantic chunk-by-chunk review walkthrough with Q&A; worktree-isolated; `--depth skim/deep`, `--focus`, `--base`. |
| **`mark-opencode`** | Keyboard-first terminal diff reviewer; line/hunk/file annotations exported as markdown; works as a git pager/difftool; split+unified layouts. |
| **`oh-my-review-experts`** (`omre`) | Five-expert AI review panel (spec/quality/security/performance/concurrency) with smart slicing, cost guardrails, review memory, markdown+JSON reports. |

**Conclusion:** you're not missing *one* plugin — you're missing the **annotation→agent
loop** that all of them implement. None of them do what Review Surface does (multi-repo,
live in-editor working-code highlighting in VS Code), and Review Surface doesn't do what all
of them do (the feedback loop). Complementary, not competitive. Pragmatic move: **add the
loop to Review Surface** rather than adopt a plugin — OpenCode runs in this harness, so
"send to OpenCode session" is feasible, with "copy as markdown" as the universal fallback.

---

## 5. Suggested roadmap

1. **v0.3 — Session reviewed-state + per-file `+/−` counts in the tree.**
   Small, pure UX, no persistence debate.
2. **v0.4 — Line annotations → markdown export / send to agent.**
   The single highest-leverage feature; turns the review surface from a mirror into a
   channel. Start with: select lines → comment → "Copy review comments as Markdown" +
   "Send to OpenCode session".
3. **v0.5 — Agent-change awareness.**
   Dirty-state snapshot when an OpenCode/Codex session starts; "changes since the agent
   began" scope toggle; human-vs-agent attribution.
4. **Later — per-hunk keep/undo** (only if Review Surface should enter the approval flow),
   semantic chunking, AI findings via a reviewer pass.

---

## 6. Source notes

- OpenAI: *Introducing the Codex app* (2026-02), *Introducing upgrades to Codex* (2025-09),
  openai.com/codex
- Jeff Morhous, *The new Codex Mac app rocks* (augmentedswe.com, 2026-02)
- zenn.dev/dokusy, *Trying out the Codex app* (2026-05)
- bettertoken.ai, *Codex CLI vs App vs VS Code Extension* (2026-07)
- openai/codex issues: #11972 (v0.98 diff regression), #13561 (3-line approval widget),
  #18149 (interactive /diff explorer), #2998 (IDE diff/approval), #39939 (pre-apply edit
  review)
- feedbackbench.com, *verify.change_review_ui* criteria (cross-agent complaint stats)
- code.claude.com *Use Claude Code in VS Code*; datacamp + descope Claude Code VS Code
  guides; anthropics/claude-code issue #61794 (per-hunk request)
- code.visualstudio.com, *Review and revert agent changes* (Agents window / working set)
- aider.chat/docs/git.html; aider-vs-Continue/Cursor comparisons (pickuma, lowcode.agency,
  toolhalla)
- coderabbit.ai IDE docs (review, findings, fix-with-ai)
- norrin (VS Code marketplace)
- OpenCode plugin ecosystem: opendock.net, GitHub (oorestisime/opencode-diffs,
  wuwei-apc/opencode-diff-review, bronteee/code-stroll, zapsaang/oh-my-review-experts),
  npm (opencode-diff, opencode-diff-feedback, mark-opencode, @plannotator/opencode)

---

## 7. Focus Mode research (v0.3.1) — how to hide unmodified lines in a VS Code editor

Question: can a normal (non-diff) VS Code editor show *only* the changed lines of a file,
the way the diff editor's "Hide Unchanged Regions" does?

### What VS Code offers

1. **The native "N unmodified lines" bar is diff-editor-only.** The built-in diff editor has
   `diffEditor.hideUnchangedRegions` (`enabled`, `minimumLineCount`, `contextLineCount`) and
   renders collapsed blocks as a compact bar reading e.g. `71 unmodified lines` with expand
   buttons. None of that machinery is exposed for normal editors — Monaco's
   `diffUnchangedRegionStyle: 'line-info'` is not reachable from the `vscode` API.
2. **Folding is the only mechanism to hide lines in a normal editor** (microsoft/vscode#37682,
   discussions#77, aeschli in #108232):
   - `languages.registerFoldingRangeProvider(selector, provider)` defines arbitrary fold
     regions (full lines only; the region's first line always stays visible and carries the
     chevron).
   - `editor.fold` / `editor.unfold` accept `{ selectionLines: [0-based start lines] }` to
     collapse/expand specific regions programmatically. Confirmed by the VS Code team as the
     intended extension path.
3. **Pitfalls we must design around:**
   - A provider's *mere presence* disables indentation-based folding for every document it
     matches — register it only while focus mode is on, scoped to the reviewed repos
     (`RelativePattern(repoRoot, '**/*')`).
   - Providers merge; on a same-start-line tie the earlier-registered provider wins, so a
     language fold could swallow ours — after folding, send `editor.unfold` for every changed
     start line as a safety pass.
   - The folding model updates asynchronously — wait a beat (`FOLD_APPLY_DELAY_MS` = 200 ms)
     before sending the fold commands.
   - `editor.fold` on an already-collapsed region folds its *parent* — apply folds once per
     document per focus session, never on every refresh.
4. **The "bar" text** we fake with a per-range `renderOptions.after.contentText` decoration on
   the chevron line: `⋯ N unmodified lines`, colored like ghost text. When the user expands
   manually the hint stays (accepted limitation).

### Prior art

- **SemanticDiff** (marketplace) — "displays only the changes, not the full file", context
  lines setting standard value 3, Load More / Load Parent Scope buttons. Custom renderer, not
  achievable for a working-file editor.
- **plannotator v0.11.3** — GitHub-style expandable context between hunks: separators showing
  how many unmodified lines are hidden. Same UX we replicate with folding.
- **stream-monaco** — documents the native knob names (`hideUnchangedRegions`,
  `contextLineCount: 3`, `line-info` style) worth mirroring in our settings vocabulary.
- **Codex VS Code review view** (#34633) — hides unmodified lines by default; users beg for a
  toggle to the full file. Our direction is the inverse default (full file, opt-in focus),
  which reviewers argue for in that very thread.

### Shipped design (v0.3.1)

- Pure planner `planFocusFolds` (domain): pad each changed window with `focusContextLines`
  (setting, default 3), merge, fold every unchanged gap ≥ `MIN_FOCUS_UNCHANGED_LINES` (3);
  head/tail gaps included.
- `FocusModeController` (presentation): session toggle, provider lifecycle, programmatic fold,
  hint decorations, unfold-on-disable.
- Buttons in the editor title bar next to F7/Shift+F7 arrows: `$(fold-down)` Focus Changed
  Lines / `$(unfold)` Show Full File; command palette toggle for keyboard users.
- Not persisted; not the default. F7 navigation auto-expands folded regions (VS Code reveal
  behavior), so review flow survives focusing.
