# Review Surface — Implementation Instructions

Build a production-quality VS Code extension named **Review Surface**. Follow this document in order. Do not skip a requirement. Do not add features that are not listed here.

Source of truth for product behavior: `start.md`. This file is the execution plan: every step, the file it belongs in, and how testing is performed.

---

## 0. Rules that override convenience

1. **SOLID.** Domain code does not know about VS Code. Infrastructure implements ports. Application orchestrates. Presentation adapts to `vscode.*`. `src/extension.ts` is the only composition root.
2. **DRY.** One diff parser, one tree builder, one Git argument builder, one path normalizer, one URI codec, one error formatter. Tests import production code; they do not reimplement it.
3. **Zero magic numbers and zero duplicated identifiers.** Every numeric literal and every command/view/context/color/config/scheme string used by logic lives in `src/config/`. Business and presentation code imports those names. Tests may import the same constants; they must not hard-code a second copy of an ID or of `10` / `4b825dc…` when asserting production behavior.
4. **Inner layers never import `vscode`.** `src/domain/**` and `src/application/**` must typecheck with no `@types/vscode` usage. If a file in those folders needs a VS Code type, the boundary is wrong — push the VS Code call to `src/presentation/` or `src/infrastructure/` behind a port.
5. **Out of scope — do not implement:** mark-as-reviewed, checkboxes, done/approved tracking, persisted review-completion metadata, comments, blame, AI summaries, staging/commit actions, or any extra view. The list is only the current Git reality for the selected scope.
6. **Git execution is `child_process.execFile` with an argument array.** Never `exec`, never a shell string, never interpolated user paths inside a shell command.
7. **Do not open a diff editor unless the user explicitly asks** (hover command link, line-number context menu, editor title action, or command palette). Clicking a file in the list opens the normal text editor.

---

## 1. Target repository layout

Create exactly this shape (tests may add files only under `test/` and `media/`):

```text
package.json
tsconfig.json
tsconfig.integration.json
eslint.config.mjs
esbuild.mjs
vitest.config.ts
.vscodeignore
.gitignore
media/
  activity-bar.svg
  gutter-changed.svg
  icon-refresh.svg
  icon-tree.svg
  icon-flat.svg
  icon-scope.svg
  icon-diff.svg
  icon-lock.svg
  icon-unlock.svg
src/
  extension.ts
  config/
    constants.ts
    defaults.ts
    identifiers.ts
  domain/
    models.ts
    ports.ts
    DiffHunkParser.ts
    ScopeBaseResolver.ts
    FileTreeBuilder.ts
  infrastructure/
    GitCliExecutor.ts
    gitArguments.ts
    WorkspaceRepoLocator.ts
    GitChangeCollector.ts
    NodeClock.ts
    NodeFileSystem.ts
    VsCodeReadOnlyAdapter.ts
    MemoryReviewStateStore.ts
  application/
    ReviewCoordinator.ts
    debounce.ts
  presentation/
    ReviewTreeDataProvider.ts
    DiffDecorationManager.ts
    ReadOnlySessionController.ts
    BaseContentProvider.ts
    CommandRegistrar.ts
    treeItemFactory.ts
  util/
    paths.ts
    reviewUri.ts
    errors.ts
    disposables.ts
test/
  unit/
    DiffHunkParser.test.ts
    ScopeBaseResolver.test.ts
    FileTreeBuilder.test.ts
    ReviewCoordinator.test.ts
    helpers/
      fakeGit.ts
      fakeClock.ts
  integration/
    runTest.ts
    index.ts
    suite/
      multiRepoTree.test.ts
      flatListToggle.test.ts
      scopeSwitching.test.ts
      readOnlyAndEdit.test.ts
      diffEscapeHatch.test.ts
    support/
      gitFixture.ts
      extensionApi.ts
```

`src/infrastructure/MemoryReviewStateStore.ts` is an in-memory adapter of `IReviewStateStore`. It stores scope and view mode only. It must not have a field, method, or map for reviewed/approved/done files.

---

## 2. Step 1 — Initialize the project

**Where:** repo root.

### 2.1 `package.json`

- `name`: `review-surface`
- `displayName`: `Review Surface`
- `description`: one sentence — unified live review of Git changes in the working editor, read-only by default.
- `version`: `0.1.0`
- `publisher`: `review-surface` (local; not published in this task)
- `engines.vscode`: `^1.90.0` (needs `workbench.action.files.setActiveEditorReadonlyInSession` and `TabInputTextDiff`)
- `engines.node`: `>=20`
- `main`: `./dist/extension.js`
- `activationEvents`: `onView:${VIEW_ID}` — write the literal in `package.json` because VS Code cannot import TS constants here. The same string must be the value of `VIEW_ID` in `src/config/identifiers.ts`. Activation may also include `onStartupFinished` only if the view contribution alone does not activate before tests call commands; prefer `onView` plus `onCommand` for every contributed command so integration tests that execute a command activate the extension.
- `categories`: `["Other", "SCM"]`
- `extensionDependencies`: do **not** hard-require `vscode.git`. Discover it at runtime and fall back to `.git` directory detection.

Scripts (names are the contract the final check uses):

| Script | Command | Purpose |
| --- | --- | --- |
| `compile` | `tsc -p tsconfig.json --noEmit` | Strict typecheck of extension source |
| `compile:tests` | `tsc -p tsconfig.integration.json` | Emit integration tests to `out-test/` |
| `lint` | `eslint .` | Lint `src/` and `test/` |
| `build` | `node esbuild.mjs` | Bundle `src/extension.ts` → `dist/extension.js` |
| `test:unit` | `vitest run` | Domain + application unit tests, no VS Code |
| `test:integration` | `npm run build && npm run compile:tests && node ./out-test/test/integration/runTest.js` | Real Extension Host |
| `check` | `npm run compile && npm run lint && npm run build && npm run test:unit && npm run test:integration` | Gate used at the end |

Dev dependencies (do not add a test runner you do not use):

- `typescript`, `@types/node`, `@types/vscode`, `@types/mocha`
- `eslint`, `@eslint/js`, `typescript-eslint`
- `esbuild`
- `vitest`
- `@vscode/test-electron`
- `mocha` (integration runner inside the Extension Host only)
- `glob` only if the VS Code test runner version you pin still needs it

No runtime dependencies unless a port implementation truly needs one. Git is invoked as a system binary (`GIT_COMMAND`).

### 2.2 `tsconfig.json`

- `strict`: true
- `target`: `ES2022`
- `module`: `Node16` (or `commonjs` if esbuild externalizes `vscode` and the bundle is CJS — pick **one** module story and keep `esbuild` format matching it; VS Code extension host loads CJS, so **esbuild `format: 'cjs'`** and tsconfig `module: 'commonjs'` is the safer pair)
- `moduleResolution`: `node`
- `rootDir`: `src`
- `outDir`: `dist` is unused if esbuild bundles; still set `noEmit` on the typecheck project
- `lib`: `["ES2022"]`
- `sourceMap`: true
- `esModuleInterop`: true
- `skipLibCheck`: true
- `types`: `["node"]` — **do not** include `vscode` in a way that domain files are encouraged to import it. `@types/vscode` may be present for presentation files only. Enforce the boundary with ESLint `no-restricted-imports` on `src/domain/**` and `src/application/**` banning the `vscode` module.

### 2.3 `tsconfig.integration.json`

- extends the base config
- `rootDir`: `.`
- `outDir`: `out-test`
- `noEmit`: false
- `include`: `["src/**/*.ts", "test/integration/**/*.ts"]`
- Integration tests import `vscode`. They run compiled, not via Vitest.

### 2.4 `eslint.config.mjs`

- TypeScript recommended, strict.
- `src/domain/**` and `src/application/**`: `no-restricted-imports` of `vscode`.
- `@typescript-eslint/no-magic-numbers` on `src/**` except `src/config/**`. Ignore `0` and `1` only if the rule's `ignore` option is required to keep array indexes readable; every other numeric literal (including `10`, timeouts, alphas, hunk offsets used as domain meaning) must be a named constant. Prefer **no ignore list** and named constants even for index offsets (`ONE_BASED_TO_ZERO_BASED_OFFSET`).
- Tests may use numeric literals that describe fixtures (line counts in sample diffs) but must import production IDs and `GIT_EMPTY_TREE_HASH` / `DEFAULT_COMMIT_COUNT` when asserting those behaviors.
- No `any` unless a VS Code API boundary forces it; if so, isolate it in infrastructure/presentation and comment why.

### 2.5 `esbuild.mjs`

- Entry: `src/extension.ts`
- Outfile: `dist/extension.js`
- `bundle: true`, `platform: 'node'`, `format: 'cjs'`, `external: ['vscode']`, `sourcemap: true`
- Target node 20
- Fail the process on build errors

### 2.6 `vitest.config.ts`

- `include`: `test/unit/**/*.test.ts`
- environment: `node`
- Do not start VS Code. Do not import `vscode` from unit tests. If a unit test file imports `vscode`, the suite is wrong.

### 2.7 `.gitignore`

Ignore `node_modules/`, `dist/`, `out-test/`, `.vscode-test/`, `*.vsix`, `coverage/`.

### 2.8 `.vscodeignore`

Exclude `src/`, `test/`, `**/*.map`, `tsconfig*.json`, `eslint.config.mjs`, `esbuild.mjs`, `start.md`, `instruction.md`. Keep `dist/` and `media/`.

### 2.9 Install

From the repo root: `npm install`. Do not proceed to feature code until `npx tsc --noEmit` can at least see a compiling empty `src/extension.ts` (`activate` / `deactivate` stubs).

---

## 3. Step 2 — `package.json` contributions

**Where:** `package.json` `contributes`, with matching constants in `src/config/identifiers.ts`.

The JSON file cannot import TypeScript. After editing contributions, open `identifiers.ts` and make every ID string identical. A unit-free review grep at the end must show each command ID, view ID, context key, color ID, config key, and scheme in exactly two places: `package.json` and `src/config/identifiers.ts` (plus menu `when` clauses, which repeat the context-key string). No third copy in logic.

### 3.1 Identifiers (define these names)

**View container id:** `review-surface`
**View id:** `review-surface.changes`

**Commands:**

| Constant | ID | Title | Palette |
| --- | --- | --- | --- |
| `CMD_REFRESH` | `review-surface.refresh` | Refresh Review Surface | yes |
| `CMD_TOGGLE_VIEW_MODE` | `review-surface.toggleViewMode` | Toggle Tree / Flat List | yes |
| `CMD_SET_SCOPE_LAST_N` | `review-surface.setScopeLastN` | Set Scope: Last N Commits | yes |
| `CMD_SET_SCOPE_DATE_RANGE` | `review-surface.setScopeDateRange` | Set Scope: Date Range | yes |
| `CMD_OPEN_FILE` | `review-surface.openFile` | Open File in Review Surface | no (invoked by tree items) |
| `CMD_OPEN_DIFF` | `review-surface.openDiffVsBase` | Open Diff vs Base | yes |
| `CMD_TOGGLE_EDIT_MODE` | `review-surface.toggleEditMode` | Toggle Review Edit Mode | yes |
| `CMD_INTERNAL_STATE` | `review-surface.internal.getSnapshot` | (none) | **not contributed** |

`CMD_INTERNAL_STATE` is registered in code only when `process.env.REVIEW_SURFACE_TEST === '1'`. It is not a user feature. Integration tests need it because the Extension Host cannot read decoration ranges or context keys any other way. It returns a JSON-serializable snapshot:

```ts
{
  viewMode: 'tree' | 'flat';
  scopeLabel: string;
  fileCount: number;
  fileKeys: string[]; // `${repoId}::${relativePath}`
  activeEditor: {
    uri: string;
    scheme: string;
    isReviewSession: boolean;
    posture: 'read-only' | 'editing' | 'none';
    decorationLineCount: number;
  } | null;
}
```

Do not add reviewed-file fields to this snapshot.

**Context keys:**

| Constant | Key | Meaning |
| --- | --- | --- |
| `CTX_REVIEW_FILE` | `reviewSurface.isReviewFile` | Active editor was opened from Review Surface (or is the current file of such a session) |
| `CTX_READ_ONLY` | `reviewSurface.isReadOnly` | Session posture is read-only |
| `CTX_VIEW_IS_TREE` | `reviewSurface.viewIsTree` | Tree mode (true) vs flat (false) |

**Config keys:**

| Constant | Key | Default | Purpose |
| --- | --- | --- | --- |
| `CFG_DEFAULT_COMMIT_COUNT` | `reviewSurface.defaultCommitCount` | `10` (reference `DEFAULT_COMMIT_COUNT` in the description text; the JSON default must equal that constant) | Initial Last-N scope |
| `CFG_DEBOUNCE_MS` | `reviewSurface.debounceRefreshMs` | value of `DEBOUNCE_REFRESH_MS` | Live-sync debounce |

**Color ids:**

| Constant | ID | Light / Dark |
| --- | --- | --- |
| `COLOR_ADDED_LINE_BG` | `reviewSurface.addedLineBackground` | green tint, alpha from `ADDED_LINE_ALPHA` |
| `COLOR_MODIFIED_LINE_BG` | `reviewSurface.modifiedLineBackground` | blue/amber tint, alpha from `MODIFIED_LINE_ALPHA` |

Use `contributes.colors` so `ThemeColor` resolves in both themes. Decoration `backgroundColor` must use these IDs, not hard-coded hex in presentation code. Alpha values live in `constants.ts` and are applied when registering the color contribution defaults (the only place RGBA literals for highlights exist).

**URI scheme:** `SCHEME_BASE = 'review-surface-base'`

**Keybindings:**

- `CMD_TOGGLE_EDIT_MODE` → `alt+r` when `editorTextFocus && reviewSurface.isReviewFile`
- `CMD_OPEN_DIFF` → `alt+d` when `editorTextFocus && reviewSurface.isReviewFile`

Both must be overridable (normal `contributes.keybindings`, no `isDefault` removal).

### 3.2 Views

```json
"viewsContainers": {
  "activitybar": [
    {
      "id": "review-surface",
      "title": "Review Surface",
      "icon": "media/activity-bar.svg"
    }
  ]
},
"views": {
  "review-surface": [
    {
      "id": "review-surface.changes",
      "name": "Changed Files",
      "contextualTitle": "Review Surface"
    }
  ]
}
```

The tree provider sets `TreeView.message` and `TreeView.description` to the active scope label (for example `Last 10 commits` or `Last 3 days`). Toolbar actions also exist; the message is mandatory so the scope is visible without opening a menu.

### 3.3 Menus

**`view/title`** (on `view == review-surface.changes`):

1. `CMD_TOGGLE_VIEW_MODE` — icon switches between `media/icon-flat.svg` (shown in tree mode, tooltip "Show Flat List") and `media/icon-tree.svg` (shown in flat mode, tooltip "Show Tree"). Implement as two menu entries with `when` clauses on `reviewSurface.viewIsTree`, or one command whose `TreeItem`/`menu` icon is updated via `vscode.commands` icon contribution that you refresh — two `when`-gated entries is the reliable approach.
2. `CMD_SET_SCOPE_LAST_N` — `media/icon-scope.svg`
3. `CMD_SET_SCOPE_DATE_RANGE` — same scope icon is acceptable; tooltip must say Date Range
4. `CMD_REFRESH` — `media/icon-refresh.svg`

**`editor/title`** when `reviewSurface.isReviewFile`:

1. `CMD_TOGGLE_EDIT_MODE` — lock icon when read-only (`reviewSurface.isReadOnly`), unlock icon when editing (`!reviewSurface.isReadOnly`). Two when-gated entries.
2. `CMD_OPEN_DIFF` — `media/icon-diff.svg`, tooltip "Open Diff vs Base"

**`editor/lineNumber/context`** when `reviewSurface.isReviewFile`:

- `CMD_OPEN_DIFF` labeled "Open Diff vs Base"

**`commandPalette`:**

- Hide `CMD_OPEN_FILE` (`when`: `false`)
- Show the others

### 3.4 Configuration contribution

`reviewSurface.defaultCommitCount`: number, minimum `MIN_COMMIT_COUNT` (1), default 10.
`reviewSurface.debounceRefreshMs`: number, minimum 50 (name this `MIN_DEBOUNCE_REFRESH_MS` in constants; the JSON minimum duplicates it — keep them equal).

---

## 4. Step 3 — Icons

**Where:** `media/`.

Create real SVG files (not empty, not missing). Activity bar and toolbar icons fail the extension host if the path 404s. Requirements:

- `activity-bar.svg` — 24×24, simple document-with-mark glyph, `currentColor` or a single fill that is visible on the activity bar (VS Code tints activity-bar SVGs; use a filled path, no external images).
- `gutter-changed.svg` — small 16×16 bar or dot, used as `gutterIconPath`. Must be visible on light and dark; prefer a theme-neutral mid blue (`#3B82F6`) because gutter icons are not always tinted.
- `icon-refresh.svg`, `icon-tree.svg`, `icon-flat.svg`, `icon-scope.svg`, `icon-diff.svg`, `icon-lock.svg`, `icon-unlock.svg` — 16×16, `currentColor` stroke/fill, distinct shapes.

Do not download icon packs. Hand-write minimal SVGs. Reference them only from `package.json` and `DiffDecorationManager` via `identifiers` / a single `mediaPaths.ts` if you need TS-side paths — if you add that file, icon filenames still live in `src/config/constants.ts` as `ICON_GUTTER_CHANGED` etc.

---

## 5. Step 4 — Configuration layer

**Where:** `src/config/`. No behavior, no `vscode` import in `constants.ts`, `defaults.ts`, or `identifiers.ts`. Reading `vscode.workspace.getConfiguration` belongs in a tiny `src/config/readConfiguration.ts` (presentation/infrastructure edge) **or** in `extension.ts`. If that reader imports `vscode`, it must not be imported by domain.

### 5.1 `constants.ts` must export at least

Numeric:

- `DEFAULT_COMMIT_COUNT = 10`
- `MIN_COMMIT_COUNT = 1`
- `HOURS_PER_DAY = 24`
- `DAYS_IN_WEEK = 7`
- `THREE_DAYS = 3`
- `MS_PER_SECOND = 1000`
- `MS_PER_HOUR = MS_PER_SECOND * 60` — also name `SECONDS_PER_MINUTE = 60` and `MINUTES_PER_HOUR = 60`
- `MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY`
- `LAST_DAY_MS = MS_PER_DAY` (or just use `MS_PER_DAY * 1` with a named `ONE = 1` if the magic-number lint requires it)
- `DEBOUNCE_REFRESH_MS = 300`
- `MIN_DEBOUNCE_REFRESH_MS = 50`
- `ZERO_DIFF_CONTEXT_LINES = 0`
- `ONE_BASED_TO_ZERO_BASED_OFFSET = 1`
- `PARENT_OFFSET = 1` (HEAD~N means N commits back; the base is the parent of the oldest included commit, i.e. `HEAD~N` when at least N commits exist)
- `ADDED_LINE_ALPHA`, `MODIFIED_LINE_ALPHA` (choose values between 0.18 and 0.35 so the tint is high-visibility but text remains readable)
- `GIT_API_VERSION = 1`
- `EMPTY_COUNT = 0`
- `FIRST_INDEX = 0`

Git:

- `GIT_COMMAND = 'git'`
- `GIT_EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'`
- `GIT_HEAD = 'HEAD'`
- `GIT_UPSTREAM = '@{u}'`
- Status / diff name-status letters: `STATUS_ADDED`, `STATUS_MODIFIED`, `STATUS_DELETED`, `STATUS_RENAMED`, `STATUS_COPIED`, `STATUS_UNTRACKED`, `STATUS_UNMERGED` (`A M D R C ? U`)
- Diff args as named constants: `ARG_DIFF`, `ARG_UNIFIED`, `ARG_NAME_STATUS`, `ARG_FIND_RENAMES`, `ARG_CACHED`, `ARG_NO_COLOR`, `ARG_LITERAL_PATHSPECS` (`--literal-pathspecs`), `ARG_MAX_COUNT`, `ARG_REV_LIST`, `ARG_PRETTY_FORMAT`, etc. Build argv in `gitArguments.ts` from these, not from scattered string literals.

Date preset ids: `PRESET_LAST_24_HOURS`, `PRESET_LAST_3_DAYS`, `PRESET_LAST_WEEK`, `PRESET_CUSTOM`.

### 5.2 `defaults.ts`

- `defaultReviewScope()`: `{ kind: 'last-n', commitCount: DEFAULT_COMMIT_COUNT }`
- `defaultViewMode()`: `'tree'`

### 5.3 `identifiers.ts`

Every ID from section 3.1. Nothing else invents a command string.

---

## 6. Step 5 — Domain layer (pure TypeScript)

**Where:** `src/domain/`. **Zero `vscode` imports.** Write this before infrastructure. Unit tests in section 9 should be written alongside these files and kept green before UI work starts.

### 6.1 `models.ts`

Immutable types (readonly fields, no setters):

```ts
type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unmerged';

type ViewMode = 'tree' | 'flat';

type ReviewScope =
  | { readonly kind: 'last-n'; readonly commitCount: number }
  | { readonly kind: 'date-range'; readonly since: string; readonly until: string; readonly presetId: string };

interface RepositoryDescriptor {
  readonly id: string;        // stable: root path
  readonly name: string;      // folder basename, disambiguated if needed
  readonly rootPath: string;
  readonly hasHead: boolean;
  readonly upstreamRef: string | null; // e.g. 'origin/main', null if no upstream
}

interface LineRange {
  readonly start: number; // zero-based, inclusive
  readonly end: number;   // zero-based, exclusive
}

interface DiffHunk {
  readonly oldStart: number; // zero-based
  readonly oldCount: number;
  readonly newStart: number; // zero-based
  readonly newCount: number;
  readonly kind: 'add' | 'delete' | 'modify';
  readonly highlight: LineRange | null; // null for pure deletion (no current-file lines)
  readonly deletionAnchor: number | null; // zero-based line in the current file where a pure deletion should mark the gutter; null if not a pure deletion
}

interface ChangedFile {
  readonly repo: RepositoryDescriptor;
  readonly relativePath: string;     // POSIX, current path
  readonly previousPath: string | null; // rename/copy source
  readonly kind: ChangeKind;
  readonly statusFlags: readonly ChangeKind[]; // a file can be staged+unstaged; keep a primary kind plus flags
  readonly baseCommit: string;       // resolved comparison base for this repo
  readonly ranges: readonly LineRange[];
  readonly deletionAnchors: readonly number[];
}

interface FileTreeNode {
  readonly id: string;
  readonly label: string;
  readonly description: string; // repo badge text; empty string only for pure directory nodes if the repo is already in an ancestor — file nodes ALWAYS have a repo badge
  readonly repoId: string | null;
  readonly relativePath: string | null;
  readonly kind: 'repo' | 'directory' | 'file';
  readonly changeKind: ChangeKind | null;
  readonly collapsible: boolean;
  readonly children: readonly FileTreeNode[];
  readonly baseCommit: string | null;
  readonly previousPath: string | null;
}

interface CommitRef {
  readonly sha: string;
  readonly committedAt: string; // ISO-8601
}

interface RepoHistorySnapshot {
  readonly commitsNewestFirst: readonly CommitRef[]; // full history needed for the decision, not pre-sliced incorrectly
  readonly headSha: string | null;  // null = unborn HEAD
  readonly upstreamSha: string | null;
  readonly hasDirtyWorktree: boolean;
}

interface ResolvedBase {
  readonly baseCommit: string; // sha or GIT_EMPTY_TREE_HASH
  readonly reason: 'last-n' | 'short-history' | 'unborn-head' | 'date-range' | 'empty-date-window' | 'unpushed-widened';
}
```

`ChangedFile` is the list item. Do not add `reviewed`, `approved`, `checked`, or `done`.

### 6.2 `ports.ts`

Narrow interfaces only:

```ts
interface GitExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface IGitExecutor {
  exec(repoRoot: string, args: readonly string[]): Promise<GitExecResult>;
}

interface IRepositoryDiscovery {
  discover(): Promise<readonly RepositoryDescriptor[]>;
}

interface IClock {
  now(): Date;
}

interface IFileSystem {
  exists(absolutePath: string): Promise<boolean>;
}

interface IReadOnlyAdapter {
  setSessionReadOnly(readOnly: boolean): Promise<void>;
}

interface IReviewStateStore {
  getScope(): ReviewScope;
  setScope(scope: ReviewScope): void;
  getViewMode(): ViewMode;
  setViewMode(mode: ViewMode): void;
}
```

`IReviewStateStore` has no reviewed-file API. A test in `ReviewCoordinator.test.ts` must fail the build or fail the assertion if someone adds persistence of review completion — assert the store's public surface by using only these methods, and assert the coordinator's emitted file list equals the collector output with no filtering by a reviewed set.

### 6.3 `DiffHunkParser.ts`

Pure function: `parseUnifiedDiff(diffText: string): readonly DiffHunk[]`.

Input is `git diff --unified=0` (zero context). Rules:

- Parse `@@ -oldStart,oldCount +newStart,newCount @@` headers. Omitted count means `1` (git's rule). Name that assumed count `IMPLICIT_HUNK_COUNT = 1` in constants.
- Convert 1-based starts with `ONE_BASED_TO_ZERO_BASED_OFFSET`. A start of `0` in the header (empty side) stays empty: count `0`, no highlight on that side.
- **Addition** (`oldCount === 0`, `newCount > 0`): `highlight` covers `[newStartZero, newStartZero + newCount)`.
- **Modification** (both counts > 0): highlight the new-side range the same way.
- **Pure deletion** (`newCount === 0`, `oldCount > 0`): do not throw. `highlight` is `null`. `deletionAnchor` is the zero-based current-file line where the deletion sits (`newStart` already points at the line after the deletion in unified diff; anchor at `max(newStartZero - 0, 0)` using the new-side start, which git sets to the line the deletion attaches to). Document the chosen anchor in a one-line comment. Callers use anchors for gutter markers only, never as a whole-line "added" background.
- Multiple hunks: return all, in file order.
- Empty string, diff with only headers (`diff --git` without hunks): return `[]`.
- Binary: a line containing `Binary files` or `GIT binary patch` → return `[]` (no line highlights). Do not throw.
- `\ No newline at end of file`: ignore.
- `+` / `-` / ` ` body lines do not need to be counted if the hunk header counts are trusted; still tolerate body/header mismatch by trusting the header (git is authoritative) and not throwing.

Export `highlightRanges(hunks): readonly LineRange[]` as a one-liner filter so collectors do not reimplement it.

### 6.4 `ScopeBaseResolver.ts`

Pure class or functions. **No git calls.** Input is `ReviewScope` + `RepoHistorySnapshot` + `IClock` (only for validating caller-supplied dates; date-range `since`/`until` are already absolute ISO strings computed by the application layer before this call — the resolver does not read the clock to invent presets).

```ts
resolveBase(scope: ReviewScope, history: RepoHistorySnapshot): ResolvedBase
```

**Unborn HEAD** (`headSha === null` or `commitsNewestFirst.length === 0`): base = `GIT_EMPTY_TREE_HASH`, reason `unborn-head`.

**Last N:**

1. Clamp `commitCount` to at least `MIN_COMMIT_COUNT`. The coordinator rejects invalid input before this, but the resolver still clamps so it cannot request a negative walk.
2. Let `available = commitsNewestFirst.length`.
3. If `available <= commitCount`: window base = `GIT_EMPTY_TREE_HASH`, reason `short-history` (fewer than or exactly N commits means the parent of the root commit is the empty tree; "fewer than N" is the spec case, and exactly N also has no parent commit inside the repo).
4. If `available > commitCount`: window base = `commitsNewestFirst[commitCount].sha` (index N is the first commit **outside** the window, i.e. the parent of the oldest included commit). Reason `last-n`.
   - Example: 12 commits, N=10. Index 10 is the 11th newest (0-based), which is the parent of the 10th included commit. Commits at indexes 0..9 are inside the window. Indexes 10..11 are outside. Files that differ only in commits at indexes 10+ are excluded unless unpushed widening or dirty state applies.
5. **Unpushed widening:** if `upstreamSha !== null` and that sha is not equal to `headSha`, the unpushed base is `upstreamSha`. If the upstream sha is an ancestor older than the window base (or the window base is not an ancestor of upstream — treat "upstream is not contained in the included window" as widen), choose the **older** base so every unpushed commit is inside the comparison. Practical rule that does not need a graph walk if the caller passes commits newest-first including everything reachable from HEAD:
   - Find the index of `upstreamSha` in `commitsNewestFirst`.
   - If missing, keep window base (upstream not in this history — do not throw; log at infrastructure boundary).
   - If the upstream index is **greater than** the window's excluded index (upstream is older than the window base), replace base with `upstreamSha` and set reason `unpushed-widened`.
   - Unpushed commits are `@{u}..HEAD`. Diffing `upstreamSha`..working tree includes them even when they are older than N. That is the requirement: "Unpushed commits older than the date window or beyond N commits are still included in the base calculation."

**Date range:**

1. Include a commit when `committedAt >= since && committedAt <= until` (inclusive). Compare as epoch ms in the resolver; parsing lives in one function `parseIsoMs` in `src/util/` or next to the resolver. Invalid dates throw a domain error `InvalidScopeError` (defined in `src/domain/models.ts` or `src/util/errors.ts` without `vscode`).
2. If one or more commits match: window base = the parent of the oldest matching commit (the next older commit in `commitsNewestFirst`, which is newest-first so the oldest match's following entry). If the oldest match is the root commit, window base = `GIT_EMPTY_TREE_HASH`.
3. If **no** commit matches:
   - reason `empty-date-window`
   - base = `headSha` if `headSha !== null`, else `GIT_EMPTY_TREE_HASH`
   - Dirty files are still listed by the collector (they are not the resolver's job). An empty window must **not** fall through to "show entire history".
4. Apply the same unpushed widening as Last N. Widening can move the base older than `since`. Reason becomes `unpushed-widened` when that happens.

Preset expansion is **not** inside the resolver. `ReviewCoordinator` (or a pure function `expandDatePreset(presetId, now: Date): { since, until }` in `src/domain/ScopeBaseResolver.ts` or `src/domain/datePresets.ts`) converts:

- Last 24 hours → `now - MS_PER_DAY` .. `now`
- Last 3 days → `now - THREE_DAYS * MS_PER_DAY` .. `now`
- Last week → `now - DAYS_IN_WEEK * MS_PER_DAY` .. `now`
- Custom → user-supplied start/end, start at 00:00:00.000 local, end at 23:59:59.999 local. Name those clock-face numbers in constants (`END_OF_DAY_HOUR = 23`, `END_OF_DAY_MINUTE = 59`, `END_OF_DAY_SECOND = 59`, `END_OF_DAY_MILLISECOND = 999`).

`until` for presets is `now` (ISO). `since` is `now` minus the duration.

### 6.5 `FileTreeBuilder.ts`

```ts
buildTree(files: readonly ChangedFile[], mode: ViewMode): readonly FileTreeNode[]
```

**Sorting comparator** (single function used by tree and flat): directories before files; then `localeCompare` with `{ sensitivity: 'base' }`. Repo group nodes sort by `repo.name`.

**Multi-repo disambiguation:**

- Partition files by `repo.id`.
- If more than one repo is present, the top level is one `kind: 'repo'` node per repo (label = `repo.name`, description = `''` or the root folder name). Children are that repo's pruned relative tree. Identical relative paths (`src/index.ts` in repo A and repo B) therefore cannot collide: node ids are `${repo.id}::${relativePath}` for files and `${repo.id}::dir::${dirPath}` for directories.
- If exactly one repo is present, do **not** insert a repo group node (spatial context of the project stays primary). Every **file** node still sets `description` to `repo.name`.

**Pruned tree:**

- Split `relativePath` on `/` (normalize `\` to `/` first via `src/util/paths.ts` — the builder calls that helper, it does not reimplement slash logic).
- Create directory nodes only for segments that lead to a changed file. Untouched sibling directories never appear because they are never inserted.
- **Compact single-child directory chains:** if a directory has exactly one child and that child is a directory, merge labels with `/` (`lib/utils`) and keep compacting. Stop at a file or at a directory with two or more children. Node id uses the deepest compacted path. This is required, not optional, so tests have a stable assertion: `lib/utils/random.ts` and `lib/services/auth.ts` produce a `lib` node whose children are `utils` and `services` (two children, so `lib` is not compacted with either), and a lone `a/b/c/file.ts` with no siblings compacts to a directory labeled `a/b/c`.
- File label is the file name only (not the full path) in tree mode.
- File `description` is always the repo name.
- `changeKind` is set on file nodes so the presentation layer can pick a decoration (color/badge letter) without re-deriving git status.

**Flat list:**

- One `kind: 'file'` node per `ChangedFile`. No directory nodes.
- `label` is the POSIX relative path.
- `description` is the repo name (badge).
- Same files, same ids (`${repo.id}::${relativePath}`), sort by repo name then relative path.
- Toggling mode must not drop, duplicate, or reorder-away any file. Tests compare the set of file keys.

**Deleted / renamed files** are included like any other `ChangedFile`. The builder does not check the disk.

---

## 7. Step 6 — Utilities

**Where:** `src/util/`. These may be imported by every layer. They must not import `vscode`.

### `paths.ts`

- `toPosixPath(p: string): string` — replace `\` with `/`
- `basenamePosix`, `dirnamePosix`, `joinPosix`
- `relativePosix(root, absolute)` — both normalized; never emit a leading `./` unless the path is `.`

### `reviewUri.ts`

- `encodeBaseUri({ repoRoot, baseCommit, relativePath, previousPath }): string` producing `review-surface-base:` URIs. Encode path segments so `#`, `?`, and spaces survive. One encode function, one decode function. `BaseContentProvider` and the diff command both use them.
- Query or path must carry `repoRoot`, `baseCommit`, and the git path (use `previousPath` for renames when showing the base side, else `relativePath`).

### `errors.ts`

- `formatGitError(repoName, args, result): string` — single formatter for logs and user-facing `window.showErrorMessage` text. Presentation may display it; infrastructure creates it.

### `disposables.ts`

- `DisposableStore` with `add` / `dispose`. `extension.ts` and long-lived controllers use it. No ad-hoc arrays of disposables copied per class.

### `src/application/debounce.ts`

- `debounce(fn, waitMs)` using `DEBOUNCE_REFRESH_MS` from the caller (the caller reads config). No default numeric literal inside `debounce.ts` other than clearing a timer. Timer handle type is `ReturnType<typeof setTimeout>` so domain tests can avoid wiring it. Coordinator tests should not depend on real timers; inject a refresh trigger or use vitest fake timers.

---

## 8. Step 7 — Infrastructure

**Where:** `src/infrastructure/`. This layer may import `node:child_process`, `node:fs`, and `vscode`. It implements ports. It does not decide view mode or read-only posture.

### 8.1 `gitArguments.ts`

Functions returning `readonly string[]`:

- `revListArgs()` → `['rev-list', '--pretty=format:%H%x09%cI', '--date-order', 'HEAD']` or equivalent **named** format constant. Parser for that format lives here or in the collector, once.
- `upstreamRevParseArgs()` → `['rev-parse', '--verify', '--quiet', '@{u}']`
- `headRevParseArgs()` → `['rev-parse', '--verify', '--quiet', 'HEAD']`
- `diffNameStatusArgs(base: string)` → `['diff', '--name-status', '--find-renames', '--no-color', '--literal-pathspecs', base]`
- `diffCachedNameStatusArgs()` → same with `--cached` against `HEAD` (or empty tree if unborn)
- `diffUnifiedZeroArgs(base: string, relativePath: string)` → `['diff', '--unified=0', '--no-color', '--no-ext-diff', base, '--', relativePath]`
- `diffCachedUnifiedZeroArgs(relativePath)`
- `showBaseArgs(base: string, gitPath: string)` → `['show', `${base}:${gitPath}`]` for the content provider. Build the `tree:path` spec in one function so `:` in paths is handled with `git show <rev> -- <path>` form instead if simpler and equally safe (`['show', `${base}:${gitPath}`]` breaks when path contains `:`). **Use** `['show', base, '--', gitPath]` and strip the commit header, **or** `['cat-file', 'blob', `${base}:${gitPath}`]` which does not use a shell. Prefer `cat-file blob` via a helper that resolves the blob id with `['rev-parse', `${base}:${gitPath}`]` then `['cat-file', 'blob', blobId]` — two execFile calls, no shell. If `rev-parse` of that spec fails (deleted in base / added file), return empty string.
- `statusPorcelainArgs()` → `['status', '--porcelain=v1', '--untracked-files=all', '--no-renames']` wait: renames **should** be detected. Use `git status --porcelain=v1 -z` **with** renames (default) and `-z` for NUL safety. Named args: `ARG_PORCELAIN`, `ARG_NULL`, `ARG_UNTRACKED_ALL`.
- `unpushedNameStatusArgs(upstream: string)` → `['diff', '--name-status', '--find-renames', upstream, 'HEAD']`

All functions live in this one file.

### 8.2 `GitCliExecutor.ts`

Implements `IGitExecutor`.

- `execFile(GIT_COMMAND, args, { cwd: repoRoot, windowsHide: true, maxBuffer: MAX_GIT_BUFFER_BYTES })`.
- `MAX_GIT_BUFFER_BYTES` in constants (e.g. 10 * 1024 * 1024, with `BYTES_PER_KIB` and `KIB_PER_MIB` named).
- Never pass `shell: true`.
- Non-zero exit: resolve a `GitExecResult` rather than throwing for expected git failures (`rev-parse HEAD` on unborn branch exits 1). Throw `GitCommandError` (formatted by `formatGitError`) only for spawn failures (git missing) and for commands the caller marked required.
- Timeout: `GIT_EXEC_TIMEOUT_MS` in constants, passed as `timeout` to execFile.

### 8.3 `WorkspaceRepoLocator.ts`

Implements `IRepositoryDiscovery`.

1. Try `vscode.extensions.getExtension('vscode.git')`. If active or activatable, `activate()`, then `getAPI(GIT_API_VERSION).repositories`.
2. Map each API repo to `RepositoryDescriptor` (`rootPath`, name from basename, upstream from `state.HEAD?.upstream` — if the API exposes `upstream.name` / `remote`, store the rev name that `rev-parse @{u}` would also resolve; still confirm with git in the collector so the domain snapshot is git-truth).
3. Also scan workspace folders for a `.git` directory or `.git` file (worktrees) so repos the Git extension has not opened yet are not dropped. Deduplicate by realpath of the root.
4. Multi-root workspace: every folder. Single folder containing nested repos: discover nested `.git` directories one level is not enough — walk workspace folders with a depth cap `MAX_REPO_SCAN_DEPTH` (constant, e.g. 4) and do not descend into `node_modules` (`IGNORED_SCAN_DIR_NAMES`).
5. Subscribe to Git API `onDidOpenRepository` / `onDidCloseRepository` via a callback the coordinator registers. The locator exposes `onDidChangeRepositories(listener)`.

Do not shell out to `find`. Use `fs` + the Git extension API.

### 8.4 `GitChangeCollector.ts`

Depends on `IGitExecutor`, `ScopeBaseResolver`, `DiffHunkParser`, `gitArguments`.

`collect(repos, scope): Promise<readonly ChangedFile[]>`:

For each repo, independently (a failure in one repo must not abort the others — capture the error, surface it through the coordinator as a view message suffix, continue):

1. `rev-parse HEAD`. Failure → unborn. Snapshot `headSha = null`, commits `[]`.
2. `rev-list` for history. Parse into `CommitRef[]` newest-first. If unborn, skip.
3. `rev-parse @{u}`. Failure → `upstreamSha = null`. Do not treat missing upstream as an error.
4. Resolve base with `ScopeBaseResolver`.
5. Gather path sets, then union by current relative path:
   - **Scoped commits + working tree vs base:** `git diff --name-status --find-renames <base>` (this includes committed changes since base **and** unstaged changes vs base, because a non-cached diff compares the working tree to `base`).
   - **Staged vs HEAD** that might not show as a content change vs an old base already included: still run `git diff --name-status --cached` so a staged change identical to a revert edge case is not dropped. Union, don't duplicate.
   - **Untracked:** parse `git status --porcelain=v1 -z`. Include `??` paths that are not ignored (porcelain already excludes ignored unless `-u` + ignored flag; do not pass `--ignored`).
   - **Unpushed:** if `upstreamSha` is set, `git diff --name-status <upstream> HEAD` and union. Widening the base usually makes this redundant; still union so a bug in widening cannot drop unpushed files. This satisfies "always included".
6. Edge cases:
   - **Rename:** name-status `R100\told\tnew` (or with score). `relativePath` = new, `previousPath` = old, kind `renamed`. Diff line ranges against the current path vs base. If git cannot diff the pair, still list the file.
   - **Delete:** kind `deleted`. Ranges empty. `deletionAnchors` from a diff if git can produce one; otherwise empty. File stays in the list.
   - **Untracked:** kind `untracked`. Highlight every line (read the file in the collector via `IFileSystem` + a line count, or `git diff --no-index --unified=0 /dev/null -- path` which is platform-fragile). Preferred: read the working file and emit a single `LineRange` `{ start: 0, end: lineCount }` using a shared `fullFileRange(text)` helper. Empty file → no highlight lines, still listed.
   - **Fewer than N commits / root:** base is empty tree. `git diff --name-status <emptyTree>` works and lists all tracked files as added. That is correct for a short history.
   - **Empty date window:** base is HEAD. `git diff HEAD` shows only working tree / staged deviations. Untracked still added from porcelain. Committed files outside the window do not appear. Dirty files do.
7. For each surviving path that exists on disk and is not a pure delete, run `git diff --unified=0 <base> -- <path>` and `parseUnifiedDiff`. Also parse `--cached` hunks and union ranges (a staged hunk and an unstaged hunk can both exist).
8. Sort the flat `ChangedFile[]` with the same comparator the tree builder uses for files, so the coordinator does not sort a second way. Export that comparator from `FileTreeBuilder.ts` and use it here — one sort implementation.

`ChangeKind` mapping from porcelain / name-status letters uses the status constants. One function `toChangeKind(letter: string): ChangeKind`.

### 8.5 `NodeClock.ts` / `NodeFileSystem.ts`

Trivial port adapters. `NodeClock.now()` returns `new Date()`. Tests never use these; they inject fakes.

### 8.6 `VsCodeReadOnlyAdapter.ts`

Implements `IReadOnlyAdapter` by executing `workbench.action.files.setActiveEditorReadonlyInSession`. This command toggles in some VS Code versions and sets in others — **verify during implementation**. If it only toggles, do not call it blindly. Detection strategy:

- Maintain posture in `ReadOnlySessionController` as the source of truth.
- After opening a file, if the editor is not yet read-only, invoke the workbench command once.
- Observable check used by both the controller and integration tests: `editor.edit(...)` returns `false` when the session is read-only.
- The adapter method should be `setSessionReadOnly(desired: boolean)` and internally toggle only when the current observed state differs. Put observation behind a small `IEditorEditProbe` in the presentation layer if the port must stay free of `vscode.TextEditor`. Practical split: the port stays `setSessionReadOnly(desired)`; the VS Code adapter receives a `() => Promise<boolean>` probe injected from the controller. Do not loop the command more than `MAX_READONLY_TOGGLE_ATTEMPTS` (constant, value 2).

### 8.7 `MemoryReviewStateStore.ts`

In-memory `IReviewStateStore`. Initial scope from `defaultReviewScope()` but the composition root overwrites `commitCount` from configuration on activate. No disk writes.

---

## 9. Step 8 — Application layer

**Where:** `src/application/ReviewCoordinator.ts`. No `vscode` import.

Responsibilities:

- Hold `IReviewStateStore`, `IRepositoryDiscovery`, collector, clock, and a `ReviewListener` port (define it in `ports.ts`):

```ts
interface ReviewSnapshot {
  readonly scope: ReviewScope;
  readonly scopeLabel: string;
  readonly viewMode: ViewMode;
  readonly files: readonly ChangedFile[];
  readonly tree: readonly FileTreeNode[];
  readonly errors: readonly string[];
}

interface ReviewListener {
  onSnapshot(snapshot: ReviewSnapshot): void;
}
```

- `refresh()`: discover repos, `collect`, `buildTree(files, viewMode)`, notify listener. Debounce rapid calls through `scheduleRefresh()` using the injected delay. `refresh()` immediate path exists for tests and for explicit refresh command.
- `setScope(scope)`: persist in the store, refresh.
- `setLastN(count)`: if `count < MIN_COMMIT_COUNT` or not an integer, throw `InvalidScopeError`. Do not silently coerce in the coordinator (the command layer can show the error). 
- `setDatePreset(presetId, now = clock.now())` / `setCustomDateRange(start, end)`.
- `toggleViewMode()`: flip store, rebuild tree from the **last file list** without a git round-trip, notify. Also allowed to refresh; tests assert the file-key set is unchanged across toggle.
- `getSnapshot()`: last snapshot.
- Scope label strings are built in one function `formatScopeLabel(scope): string` in the coordinator or domain. Examples: `Last 10 commits`, `Last 24 hours`, `Last 3 days`, `Last week`, `Custom: YYYY-MM-DD – YYYY-MM-DD`. Number formatting uses the scope's `commitCount`, not a hard-coded 10, except the default scope's count which is the constant.
- No method named review/approve/mark/dismiss. No filtering of files after collect except dedupe by `repo.id + relativePath`.

Live-sync wiring is **not** inside the coordinator. `extension.ts` or a `src/presentation/LiveSyncController.ts` subscribes to:

- repository locator changes
- `vscode.workspace.createFileSystemWatcher('**/*')` (exclude nothing extra; gitignore is git's job)
- `onDidChangeTextDocument` → `scheduleRefresh()`
- `onDidSaveTextDocument` → `scheduleRefresh()`
- `onDidChangeActiveTextEditor` → decoration manager refresh (not necessarily a full git collect; still schedule a collect because the list is the source of truth)
- Git API repo state `onDidChange` if available

Debounce all of those through `coordinator.scheduleRefresh()`. Explicit refresh command calls `coordinator.refresh()` immediately.

If you add `LiveSyncController.ts`, it is presentation/infrastructure (it imports `vscode`) and it only calls coordinator methods.

---

## 10. Step 9 — Presentation layer

**Where:** `src/presentation/`. This is the only place that constructs `TreeItem`, decoration types, status bar items, and `TextDocumentContentProvider`.

### 10.1 `treeItemFactory.ts`

`toTreeItem(node: FileTreeNode): vscode.TreeItem`

- File: `collapsibleState = None`, `resourceUri` = absolute file URI when the file exists. `description` = node.description (repo badge). `tooltip` = `${repo name} · ${relative path} · ${changeKind}`.
- `icon` or `resourceUri` + `FileDecoration` is optional. Required visual on the row: repo badge via `description`, and a short change-kind prefix or `ThemeIcon` (`add`, `edit`, `trash`, `diff-renamed`) chosen in **one** map `CHANGE_KIND_THEME_ICON` in this file. Theme icon ids are VS Code built-ins, listed once.
- Command on file nodes: `CMD_OPEN_FILE` with arguments `[OpenFileArgs]` where `OpenFileArgs` is `{ repoRoot, repoId, relativePath, previousPath, baseCommit, kind }`.
- Directory / repo nodes: collapsed by default (`Collapsed`), no command.
- `id` = node.id so the tree preserves expansion across refresh as well as VS Code can.

Context value `reviewSurface.file` on file items if you need item context menus. A per-item "Open Diff" is allowed in `view/item/context` as an additional escape hatch. It is not a substitute for the three required escape hatches.

### 10.2 `ReviewTreeDataProvider.ts`

- Implements `TreeDataProvider<FileTreeNode>`.
- `getTreeItem` / `getChildren` read the coordinator snapshot. Roots = `snapshot.tree`. Children = `node.children` (already built; do not rebuild the tree here).
- On snapshot: `this._onDidChangeTreeData.fire()` and update `treeView.message` + `treeView.description` to `scopeLabel`. If `errors.length > 0`, append ` · ${errors.length} repo error(s)` using a named format, not a magic string scattered elsewhere — one `formatViewMessage(snapshot)` function.
- Empty state message: `No changes in this scope` when `files.length === 0` and no errors. Still show the scope label in `description`.
- Badge: `treeView.badge` = `{ value: fileCount, tooltip: 'Changed files' }` if the API exists. File count is the number of file nodes, not directory nodes.

### 10.3 `DiffDecorationManager.ts`

Create two `TextEditorDecorationType`s on construction:

1. **Added/modified background** (mandatory):
   - `isWholeLine: true`
   - `backgroundColor: new ThemeColor(COLOR_ADDED_LINE_BG)` for added and untracked
   - a second type with `COLOR_MODIFIED_LINE_BG` for modified/renamed/copied
   - `overviewRulerColor` set to the same ThemeColor
   - `overviewRulerLane: OverviewRulerLane.Full` (use the enum, not a number)
   - `gutterIconPath`: `Uri.file` pointing at `media/gutter-changed.svg`
   - `gutterIconSize`: `'contain'`
2. **Deletion anchor** (secondary): gutter icon + overview ruler only, **no** whole-line added background (the line may be unrelated content). `isWholeLine: false`.

`hoverMessage` on highlight ranges: `MarkdownString` with `isTrusted: true` containing a command link:

```text
[Open Diff vs Base](command:review-surface.openDiffVsBase)
```

The command id in that markdown must be the `CMD_OPEN_DIFF` constant interpolated into the string, not a second literal. Pass arguments the command can resolve even when the link does not include JSON args: the command reads the active editor URI and the coordinator snapshot to find the `ChangedFile`. That is more reliable than encoding args into markdown.

Apply decorations when:

- the active editor's document uri matches a `ChangedFile` absolute path
- including after toggle to edit mode (do not clear decorations in `setEditing`)
- on `onDidChangeActiveTextEditor` and after each snapshot

Clear decorations when the active file is not in the snapshot.

**Do not** dispose and recreate decoration types on every keystroke. Update ranges via `editor.setDecorations`.

Deleted files have no text editor; skip decorations.

### 10.4 `ReadOnlySessionController.ts`

State machine per document uri (session map in memory, not persisted):

- Opening from Review Surface calls `openReviewFile(args)`:
  1. If `kind === 'deleted'` or `IFileSystem.exists` is false: do not create a normal editor. Call the diff opener (or open the base content provider read-only in a single editor titled with the file name). Then return.
  2. Else `vscode.window.showTextDocument(fileUri, { preview: false, preserveFocus: false })`.
  3. Mark uri as a review session (`CTX_REVIEW_FILE = true` when this editor is active).
  4. Set posture read-only via `IReadOnlyAdapter.setSessionReadOnly(true)`.
  5. Set `CTX_READ_ONLY = true`.
  6. Status bar: create one `StatusBarItem` (priority from `STATUS_BAR_PRIORITY` constant), alignment left, command `CMD_TOGGLE_EDIT_MODE`, text `Review: Read-Only` or `Review: Editing`. Show it only while a review file is active; hide it otherwise.
- `toggleEditMode()`:
  - Flip posture.
  - Call adapter.
  - Update context key and status bar text.
  - **Do not** call `decorationManager.clear()`. After toggle, re-apply decorations for the active editor.
- Context keys are set with `vscode.commands.executeCommand('setContext', key, value)` using identifier constants.
- Editor title buttons depend on those context keys (already contributed). The controller must update keys **before** yielding so the lock/unlock icon tracks the posture.
- Files opened from the explorer (not from Review Surface) are not forced read-only and do not show the status item. Track a `Set<string>` of uris opened by `openReviewFile`.

### 10.5 `BaseContentProvider.ts`

`vscode.workspace.registerTextDocumentContentProvider(SCHEME_BASE, provider)`.

- `provideTextDocumentContent(uri)`: decode with `reviewUri.ts`, `git cat-file` / `rev-parse` the blob, return the text. Missing blob (added file) returns `''`.
- `onDidChange` emitter if a refresh could show a different base for the same uri. Include `baseCommit` in the uri so a scope change naturally changes the uri; no stale cache required. If you cache, key by the full uri and drop the cache on snapshot change.

### 10.6 Diff opener

One function `openDiffVsBase(args | activeEditor)` in `CommandRegistrar` or a `DiffOpener.ts` under presentation:

- Resolve `ChangedFile` from args or from the active editor path + snapshot.
- Left uri: `review-surface-base` via `encodeBaseUri` (previous path for renames).
- Right uri: workspace file uri. If the file was deleted, the right side can be an empty `untitled` document or the same provider with a `side=current` empty document. Prefer `vscode.diff` with left = base blob and right = file uri when the file exists.
- Title: `${basename} (Base ↔ Current)`.
- `vscode.commands.executeCommand('vscode.diff', left, right, title)`.

This function is the only place that starts `vscode.diff`.

### 10.7 `CommandRegistrar.ts`

Register every command in section 3.1 and delegate:

| Command | Delegation |
| --- | --- |
| refresh | `coordinator.refresh()` |
| toggle view | `coordinator.toggleViewMode()` |
| set last N | `showInputBox` for a number, then `coordinator.setLastN`. Validate with `MIN_COMMIT_COUNT`. Cancel = no change. |
| set date range | `showQuickPick` of the four presets. Custom → two `showInputBox` calls for `YYYY-MM-DD` start and end. Parse strictly; reject end < start with `showErrorMessage`. |
| open file | `readOnlyController.openReviewFile` |
| open diff | `openDiffVsBase` |
| toggle edit | `readOnlyController.toggleEditMode` |
| internal snapshot | return the test snapshot; register only if `process.env.REVIEW_SURFACE_TEST === '1'` |

Quick-pick labels live in one `scopePrompts.ts` next to the registrar so command handlers stay thin.

---

## 11. Step 10 — Composition root

**Where:** `src/extension.ts`.

`activate(context)`:

1. Construct `GitCliExecutor`, `NodeClock`, `NodeFileSystem`, `MemoryReviewStateStore` (seed commit count from configuration).
2. Construct `WorkspaceRepoLocator`, `GitChangeCollector`, `ScopeBaseResolver` (resolver is constructed inside the collector if you prefer — still a separate class).
3. Construct `ReviewCoordinator` with debounce from configuration.
4. Construct presentation services.
5. `vscode.window.createTreeView(VIEW_ID, { treeDataProvider, showCollapseAll: true })`.
6. Register content provider, commands, live sync, decoration listeners.
7. Push every disposable into `context.subscriptions` via `DisposableStore`.
8. `void coordinator.refresh()` on activate.
9. `deactivate()` disposes anything not in subscriptions (should be nothing).

No business logic in `activate` beyond wiring.

---

## 12. Step 11 — Unit tests

**Where:** `test/unit/`. Runner: **Vitest**. Command: `npm run test:unit`. No Extension Host, no `vscode` import, no real `git` binary required (fakes only).

### 12.1 Shared fakes (`test/unit/helpers/`)

- `FakeClock` implements `IClock` with a settable `Date`.
- `FakeGitExecutor` implements `IGitExecutor` with a map of `args.join('\0')` → `GitExecResult`, plus a fallback. Tests that exercise the collector (only if you add a collector unit test) use this. Domain tests for the resolver do **not** need it if they pass `RepoHistorySnapshot` directly.
- Do not copy `parseUnifiedDiff` into tests. Feed fixture strings into the production parser.

### 12.2 `DiffHunkParser.test.ts` — required cases

| Case | Fixture | Assert |
| --- | --- | --- |
| Single-line addition | `@@ -10,0 +11 @@` plus one `+` line | one hunk, highlight `{ start: 10, end: 11 }` (1-based 11 → 0-based 10) |
| Multi-line addition | `@@ -0,0 +1,3 @@` | highlight `{ start: 0, end: 3 }` |
| Modification | `@@ -4,2 +4,2 @@` | highlight `{ start: 3, end: 5 }`, kind `modify` |
| Pure deletion | `@@ -8,2 +7,0 @@` | does not throw; `highlight === null`; `deletionAnchor` is a number (assert the documented anchor) |
| Multiple hunks | two `@@` headers in one string | length 2, ranges match each header |
| Empty | `''` and a `diff --git` header with no hunks | `[]` |
| Binary | `Binary files a/foo and b/foo differ` | `[]`, no throw |
| Implicit count | `@@ -1 +1 @@` | counts treated as `IMPLICIT_HUNK_COUNT` |
| 1-based conversion | any of the above | no range uses the raw 1-based start as if it were 0-based |

### 12.3 `ScopeBaseResolver.test.ts` — required cases

Build `RepoHistorySnapshot` fixtures with a helper `history(n, options)` in the test file. Commit timestamps are explicit ISO strings so date tests do not depend on the real clock. Use `DEFAULT_COMMIT_COUNT` and `GIT_EMPTY_TREE_HASH` from `src/config/constants.ts`.

| Case | Setup | Assert |
| --- | --- | --- |
| Default last N | 15 commits, scope last-n with `DEFAULT_COMMIT_COUNT` | base sha is `commitsNewestFirst[DEFAULT_COMMIT_COUNT].sha`, reason `last-n` |
| Fewer than N | 3 commits, N = 10 | base === `GIT_EMPTY_TREE_HASH`, reason `short-history` |
| Exactly N | 10 commits, N = 10 | base === `GIT_EMPTY_TREE_HASH` (root's parent is the empty tree) |
| Unborn | `headSha: null`, commits `[]` | empty tree, reason `unborn-head` |
| Preset 24h | expand preset with `FakeClock`, one commit 1 hour ago, one commit 3 days ago | base is the parent of the recent commit only (the older commit's sha if it is the parent), reason `date-range` |
| Preset 3d | clock fixed, commits at 1 day ago and 5 days ago | 5-day commit excluded |
| Preset 1w | commit at 6 days included, commit at 8 days excluded | same pattern |
| Custom range | `since`/`until` covering two middle commits | base is parent of the oldest in-range commit |
| Empty date window, dirty flag true, head present | no commit in range | base === `headSha`, reason `empty-date-window` |
| Empty date window, unborn | no head | empty tree |
| Unpushed beyond N | 20 commits, N = 3, `upstreamSha` = commit index 12 | base === that upstream sha, reason `unpushed-widened` |
| Unpushed older than date window | date window covers only the newest commit, upstream is 10 commits back | base widened to upstream |
| No upstream | `upstreamSha: null`, N = 3, 20 commits | base stays the N-window base, reason `last-n` |
| Invalid custom range | `until < since` | throws `InvalidScopeError` |

Also unit-test `expandDatePreset` durations with `FakeClock` at a known instant: 24h === `MS_PER_DAY`, 3d === `THREE_DAYS * MS_PER_DAY`, 1w === `DAYS_IN_WEEK * MS_PER_DAY`.

### 12.4 `FileTreeBuilder.test.ts` — required cases

Helper `file(repo, relativePath, kind)` builds a `ChangedFile` with empty ranges.

| Case | Assert |
| --- | --- |
| Pruned tree | files `lib/utils/random.ts` and `views/dashboard.tsx` only. Tree contains those paths. No node labeled `lib/services` or `components`. |
| Single-child compaction | only `a/b/c/file.ts` → directory label `a/b/c` |
| No compaction when split | `lib/utils/random.ts` + `lib/services/auth.ts` → `lib` has two children `utils` and `services` |
| Flat toggle set equality | `buildTree(files, 'tree')` file keys === `buildTree(files, 'flat')` file keys |
| Flat shape | flat mode returns only `kind: 'file'`, labels are relative paths, every description is the repo name |
| Multi-repo collision | repo-a and repo-b both have `src/index.ts`. Two file nodes. Ids differ. Both descriptions show the correct repo name. Tree mode roots are two repo nodes. |
| Single repo | no repo group node; file descriptions still equal the repo name |
| Sort | directories before files; `b.ts` before `c.ts`; repo nodes alphabetical |
| Deleted file included | a `deleted` file appears in both modes |

### 12.5 `ReviewCoordinator.test.ts` — required cases

Fake `IRepositoryDiscovery` returning two `RepositoryDescriptor`s. Fake collector injected by making the coordinator depend on an `IChangeCollector` port (`collect(repos, scope)`), defined in `ports.ts` and implemented by `GitChangeCollector`. This keeps coordinator tests free of git and of `vscode`.

| Case | Assert |
| --- | --- |
| Multi-repo aggregation | collector called once per refresh with both repos; snapshot files include entries from both |
| Scope update | `setLastN(4)` then refresh calls collector with `{ kind: 'last-n', commitCount: 4 }`; `scopeLabel` contains `4` |
| Invalid N | `setLastN(0)` throws; store scope unchanged |
| Date preset | `setDatePreset(PRESET_LAST_WEEK)` stores a date-range scope whose duration is 7 days relative to the fake clock |
| View mode toggle | after toggle, `viewMode === 'flat'`, file keys identical, collector **not** called again if you implemented local rebuild; if you refresh on toggle, collector may be called but the key set must still match |
| No reviewed leakage | snapshot has no extra filtering: collector returns 3 files including one the test would have "marked" if such an API existed; all 3 are in the snapshot. Additionally, TypeScript structural check: a helper type `AssertNoReviewed<T>` that fails compilation if `IReviewStateStore` has a key matching `/review|approv|done|checkbox/i`. Implement that as a documented compile-time assertion in the test file. |
| Repo error isolation | collector returns files plus an error string for repo B; snapshot still contains repo A files and `errors.length === 1` |

Run `npm run test:unit` and keep it green before writing integration tests.

---

## 13. Step 12 — Integration tests

**Where:** `test/integration/`. These run inside a **real VS Code Extension Host** downloaded by `@vscode/test-electron`, against **real `git` repositories** created under `os.tmpdir()`.

### 13.1 How the harness runs

`test/integration/runTest.ts` (compiled to `out-test/test/integration/runTest.js`):

1. `process.env.REVIEW_SURFACE_TEST = '1'` before launching VS Code (the extension reads this to register the internal snapshot command).
2. `runTests` from `@vscode/test-electron` with:
   - `extensionDevelopmentPath`: repo root
   - `extensionTestsPath`: `out-test/test/integration/index.js`
   - `launchArgs`: the temporary workspace is **not** known at launch if each suite creates its own workspace. Use one of these two patterns (pick pattern A; it matches the spec's per-test temp repos):

**Pattern A (required):** launch VS Code with a placeholder empty directory, and inside each test call `vscode.workspace.updateWorkspaceFolders` to replace folders with the temp repos (or open a generated `*.code-workspace` via the test controller's `workspaceFile` if you generate the workspace **before** launch).

Multi-root discovery is more reliable if the Extension Host starts with the workspace already open. Use **Pattern B** for the multi-repo suites:

**Pattern B:** `runTest.ts` creates the temp git fixtures first (importing the fixture helper is fine — it is plain Node), writes a `multi.code-workspace` with two folder paths, and passes `--workspace <path>` or the workspace file as `launchArgs`. Suites that need a different history (scope switching) should **rebuild git state inside the already-opened repos** rather than launching a second VS Code, so the suite stays one process. Share one workspace across all integration tests:

```text
os.tmpdir()/review-surface-<pid>/
  repoA/   # git repo, also a workspace folder
  repoB/   # git repo, also a workspace folder
  review-surface.code-workspace
```

`runTest.ts` creates this skeleton (git init + one empty commit so HEAD exists), writes the code-workspace, launches VS Code, and tests mutate the repos further. Cleanup in a `finally` that `fs.rm`s the temp root even on failure.

3. `index.ts` is the Mocha entry (`**/*.test.js` under `suite/` via the `glob` package or `fs.readdir` — prefer `fs.readdir` to avoid an extra dependency). Mocha timeout `INTEGRATION_TIMEOUT_MS` = 120000, named in the test runner file (test code may have this literal once, in the runner only).
4. UI must not block. `launchArgs` includes `--disable-extensions` (except the development extension, which `@vscode/test-electron` handles) and the workspace path. Do not pass a flag that disables the built-in Git extension; `vscode.git` is built-in and required for one discovery path. The locator's `.git` walk is the fallback the test can rely on even if the Git extension is slow — **tests must wait** until `review-surface.internal.getSnapshot` returns the expected file keys, with a poll helper `waitFor(predicate, timeoutMs)` using `POLL_INTERVAL_MS` (100) and `WAIT_TIMEOUT_MS` (20000) defined once in `test/integration/support/extensionApi.ts`.

### 13.2 `gitFixture.ts` — real git, no shell interpolation

Use `child_process.execFileSync('git', args, { cwd })` (argument array). Configure each repo locally:

- `git init -b main`
- `git config user.email test@example.com`
- `git config user.name Review Surface Test`

Helpers:

- `writeAndCommit(repo, relativePath, content, message, isoDate?)` — sets `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` in the `env` option when `isoDate` is provided (needed for date-range tests)
- `writeDirty(repo, relativePath, content)` — no commit
- `stage(repo, relativePath)`
- `commitAll(repo, message, isoDate?)`
- `setUpstreamAt(repo, branchName)` — create a local upstream ref without a network remote: `git branch tracking main` then `git config branch.main.remote .` and `git config branch.main.merge refs/heads/tracking`, or simpler and more reliable: `git update-ref refs/remotes/origin/main <sha>` and `git config branch.main.remote origin` + `git config branch.main.merge refs/heads/main`. After that `git rev-parse @{u}` must succeed. **No network.**
- `advanceUpstream(repo, sha)` if a test needs to move the tracking ref

Never use `git commit -m "$(cat <<EOF"` or any shell.

### 13.3 `extensionApi.ts`

- `getSnapshot()` → `vscode.commands.executeCommand('review-surface.internal.getSnapshot')`
- `waitForFileKeys(expected: string[])` — poll until the snapshot's key set equals the expected set (order-independent)
- `fileKey(repoName, relativePath)` must match production id scheme. **Do not re-invent the id.** Export `changedFileKey(repoId, relativePath)` from `src/domain/FileTreeBuilder.ts` or `src/util/paths.ts` and use it in both production and tests. Integration tests that cannot import TS source cleanly should import from the compiled `out-test/src/...` path. Repo id is the root path; the fixture helper returns it.

### 13.4 Suite 1 — `multiRepoTree.test.ts`

**Setup (real git):**

- repoA: commit `lib/utils/random.ts` and `views/dashboard.tsx` with contents. Then dirty-edit `lib/utils/random.ts` so it is both committed and modified (it must show up once, not twice).
- repoB: commit `src/index.ts`, plus an untracked `notes/todo.ts`, plus a staged `src/staged.ts`.
- An untouched sibling in repoA: commit `lib/untouched/skip.ts` in the **initial** commit, then overwrite the test so the scoped window does not matter — simplest path: create `lib/untouched/skip.ts`, commit it, then **do not change it again**, and set scope to last 1 commit after a newer commit that only touches `lib/utils/random.ts`. The untouched file must not appear. Also create a directory `other/nope.ts` committed only in that old commit.

**Assert:**

1. `waitForFileKeys` contains repoA `lib/utils/random.ts`, repoA `views/dashboard.tsx` (if dashboard was in the window — put dashboard in the newest commit too, or in the dirty set), repoB `src/index.ts`, repoB `notes/todo.ts`, repoB `src/staged.ts`.
2. Does **not** contain `lib/untouched/skip.ts` or `other/nope.ts`.
3. Internal snapshot is not enough to see TreeItem descriptions. Add to the internal snapshot, only in test mode, the tree file nodes' `{ id, label, description, parentLabels }` **or** walk `ReviewTreeDataProvider` by exporting a test command `review-surface.internal.getTree` that returns the provider's current roots and children as JSON (labels, descriptions, kinds). This second internal command is allowed under the same `REVIEW_SURFACE_TEST` gate. It is not contributed to `package.json`.
4. Assert a file node description equals `repoA` or `repoB` (the folder basename).
5. Assert pruned hierarchy: a directory node exists for the path that contains `random.ts`, and no directory node is labeled `untouched` or `other`.
6. Both repos appear (two repo group nodes, because this workspace is multi-repo).

### 13.5 Suite 2 — `flatListToggle.test.ts`

Continue from the same workspace (Mocha does not guarantee order — **rebuild the expected git state in `before`**, do not depend on suite 1).

1. Record file keys from snapshot in tree mode.
2. `executeCommand(CMD_TOGGLE_VIEW_MODE)`.
3. Snapshot `viewMode === 'flat'`.
4. File keys equal the tree-mode set (same members).
5. Tree dump: every node `kind === 'file'` (no directory, no repo group). Each description is a repo basename. Labels are relative paths.
6. Toggle again. `viewMode === 'tree'`. File keys still equal. Directory nodes exist again.

### 13.6 Suite 3 — `scopeSwitching.test.ts`

**Setup in repoA (repoB can stay quiet or be asserted as still scanned):**

Create 12 commits with explicit author dates, newest last:

- Commits 1–2 (oldest), dates 30 days ago: each adds `ancient/file1.ts` and `ancient/file2.ts` and does not touch them again.
- Commits 3–12, dates within the last 2 days: commit 12 modifies `recent/window.ts`. Commits 3–11 can touch `recent/window.ts` as well so the path stays in the N=10 window.
- After commit 12, `writeDirty` `dirty/working.ts`.
- `stage` a change to `dirty/staged.ts` (write, add, do not commit).
- `writeDirty` untracked `dirty/untracked.ts` (do not add).
- Point `@{u}` at commit 2's sha **after** all 12 commits exist, so commits 3–12 are unpushed. Then also run a sub-case that moves upstream to HEAD to test "beyond N without unpushed".

**Sub-case A — default N excludes old untouched commits, includes dirty + unpushed:**

1. Reset scope to last N = `DEFAULT_COMMIT_COUNT` via `review-surface.setScopeLastN` is interactive (`showInputBox`) and **will hang the test** if you call it. Do not drive quick picks unless you use the VS Code test input stub.
2. **Required test seam:** register `review-surface.internal.setScope` under `REVIEW_SURFACE_TEST` that accepts a JSON `ReviewScope` and calls `coordinator.setScope`. Not contributed. Integration tests use this seam instead of input boxes.
3. Set last-n to 10. With upstream at commit 2, unpushed widening includes `ancient/file1.ts`. That would make the "excludes older" assertion fail. So split the sub-cases:
   - **A1:** upstream == HEAD (no unpushed). N = 10. `ancient/*` absent. `recent/window.ts` present. `dirty/working.ts`, `dirty/staged.ts`, `dirty/untracked.ts` present.
   - **A2:** move upstream to commit 2 (older than N). Refresh. `ancient/file1.ts` **appears** even though N is 10, because unpushed commits beyond N widen the base. This is the spec rule, not a bug.
4. Set N to 12 with upstream == HEAD. `ancient/file1.ts` appears because it is now inside the commit window.

**Sub-case B — date range:**

- Set a custom range covering only the last 2 days, upstream == HEAD. `ancient/*` absent, `recent/window.ts` present, dirty files present.
- Set a custom range that ends 10 days ago and starts 40 days ago (empty relative to recent commits) **and** keep dirty files. `recent/window.ts` absent (committed inside the excluded recent window, and base falls back to HEAD). Dirty files **present**.
- Set last-24-hours / last-3-days / last-week via `internal.setScope` after computing bounds with the same `expandDatePreset` function (import it). Assert the scope label from the snapshot matches `formatScopeLabel` (import that too — one implementation).

**Sub-case C — fewer than N:** a third folder is unnecessary. In repoB, keep a single commit and set N = 10. repoB's only file is included (short history → empty tree → all tracked files). Do not crash.

### 13.7 Suite 4 — `readOnlyAndEdit.test.ts`

1. Ensure `dirty/working.ts` or `recent/window.ts` is in the snapshot.
2. `executeCommand('review-surface.openFile', args)` with the same `OpenFileArgs` the tree item would pass. Export a small `openArgsFromSnapshot(fileKey)` via the internal snapshot (include `repoRoot`, `relativePath`, `baseCommit`, `kind` on each file in the test snapshot) so the test does not rebuild args by hand with a divergent shape.
3. Assert `vscode.window.activeTextEditor.document.uri.scheme === 'file'`.
4. Assert the path ends with the relative path.
5. Assert no tab is a diff tab yet (`tabGroups.all` flat map, none of `tab.input instanceof vscode.TabInputTextDiff` for this open).
6. Assert snapshot posture is `read-only` and `isReviewSession` is true.
7. **Readonly observable (verified against VS Code 1.147):** session read-only blocks content changes but `editor.edit` still resolves `true` — the API edit is silently dropped. Assert the observable effect, not the return value: capture `editor.document.getText()`, attempt `editor.edit(b => b.insert(new vscode.Position(0, 0), 'X'))`, then assert the document text is unchanged. Document text unchanged.
8. `executeCommand('review-surface.toggleEditMode')`.
9. Posture snapshot is `editing`.
10. `editor.edit` insert of a sentinel succeeds (`ok === true`). Revert with a second edit or `git checkout` so later tests are stable.
11. **Decorations remain:** snapshot `decorationLineCount > 0` after the toggle (the file must actually differ from base — the dirty file does).
12. Toggle back to read-only. `editor.edit` returns false again. `decorationLineCount` still > 0.
13. Status bar is not directly readable. The snapshot's `posture` field is the contract the status bar text is derived from. In the controller, set posture and status bar text in the same function `applyPosture` so they cannot diverge. Unit-level comment in the controller points at this test.

### 13.8 Suite 5 — `diffEscapeHatch.test.ts`

1. Open the same file via `openFile` (read-only).
2. `executeCommand('review-surface.openDiffVsBase')` with no args (active-editor path) **and**, in a second assertion, with explicit args.
3. Poll `tabGroups` until a tab satisfies `input instanceof vscode.TabInputTextDiff`.
4. Assert `input.original.scheme === 'review-surface-base'`.
5. Assert `input.modified.scheme === 'file'` and the fsPath matches the changed file.
6. `vscode.workspace.openTextDocument(input.original)` resolves (content provider works) and the text equals `git show <base>:<path>` captured by the fixture helper before the test mutated nothing further. For a dirty file, base content is the last committed text, **not** the dirty buffer.
7. Close the diff tab at the end so later suites see a clean window.

### 13.9 What integration tests do not do

- They do not click gutter icons (VS Code does not emit a click event for decoration gutters). Hover links are the same command as `openDiffVsBase`; the suite covers that command. Manual confirmation of the hover link is not required for the gate.
- They do not screenshot themes. Color contributions are reviewed by checking `package.json` `contributes.colors` contains both color ids and that `DiffDecorationManager` references the constants.
- They do not persist a review database. After a VS Code reload is unnecessary; the in-memory store test in unit tests covers absence of reviewed state.

### 13.10 Running integration tests locally

From the repo root, with `git` on `PATH`:

```bash
npm run test:integration
```

That builds the extension, compiles tests, downloads VS Code into `.vscode-test/` on first run (needs network once), and exits non-zero if any Mocha test fails.

If the download fails, set `VSCODE_TEST_VERSION` only to a version that satisfies `engines.vscode`. Do not skip the suite.

Expected runtime: first run several minutes (download), later runs under a few minutes. Timeouts are the named constants above. Do not `this.timeout(0)`.

---

## 14. Step 13 — Execute the full gate

**Where:** repo root, after all files exist.

Run, in order, and fix failures before continuing:

1. `npx tsc -p tsconfig.json --noEmit`
2. `npx eslint .`
3. `npm run build` — `dist/extension.js` exists, `vscode` is external (grep the bundle: it must `require("vscode")`, not inline the API)
4. `npm run test:unit`
5. `npm run test:integration`

Then the review pass (step 14). Then run all five commands again.

---

## 15. Step 14 — SOLID / DRY / magic-number review

**Where:** whole repo. Fix in place; do not add a new architecture.

Checklist (every item is a fail if violated):

1. `rg "from 'vscode'|require\\('vscode'\\)" src/domain src/application` → no matches.
2. `rg "reviewed|approved|markAs|checkbox" src` → no matches (word-boundary; `ReviewCoordinator` and `ReviewScope` are allowed names).
3. `rg "exec\\(|execSync\\(" src` → no matches. Only `execFile` / `execFileSync`.
4. Command id strings appear in `package.json` and `src/config/identifiers.ts` only. Presentation imports the constants.
5. `GIT_EMPTY_TREE_HASH` appears in `constants.ts` and is imported elsewhere. No second copy of the hash.
6. No unexplained numeric literals under `src/` outside `src/config/constants.ts`. ESLint enforces this; do not disable the rule file-wide.
7. `parseUnifiedDiff` is defined once. `buildTree` sort comparator is defined once.
8. `encodeBaseUri` / `decodeBaseUri` are defined once.
9. Collector does not import `ReviewTreeDataProvider`. Presentation does not import `child_process`. Domain does not import infrastructure.
10. `extension.ts` does not parse diffs or walk git history.
11. Deleted-file open path does not throw `Unable to open` uncaught.
12. Edit-mode toggle does not call `setDecorations(type, [])` except when the active file is not a changed file.
13. One repo's git failure does not reject the whole `collect` promise.

---

## 16. Step 15 — Final summary (the only closing deliverable)

After the second green gate, report:

- Architecture: one paragraph naming the layers and the ports.
- Commands: the table from section 3.1 plus keybindings.
- How to open the view: Activity Bar → Review Surface.
- Test results: unit count passed, integration count passed, commands run.
- Explicit statement that mark-as-reviewed was not implemented.
- Any VS Code version the integration host actually launched.

Do not claim a check passed if it did not.

---

## 17. Implementation order (do not reorder)

1. Project skeleton and configs (section 2) including an empty activate that compiles.
2. `package.json` contributions and `src/config/*` (sections 3 and 5).
3. Icons (section 4).
4. Domain models, ports, parser, resolver, tree builder (section 6) **with unit tests (section 12.2–12.4) green**.
5. Util + git argument builder + executor (sections 7–8.2).
6. Collector + locator (sections 8.3–8.4) — optional collector unit test with `FakeGitExecutor` is allowed but not a substitute for integration tests.
7. Coordinator + coordinator unit tests (sections 9 and 12.5).
8. Presentation + `extension.ts` (sections 10–11).
9. Integration harness and the five suites (section 13).
10. Full gate (section 14) and review (section 15).
11. Summary (section 16).

---

## 19. Amendment A — branch-local scope and base-URI fix (user workspace feedback)

Real workspace (`phl/.worktrees/AKILI-559`: `akili-crm`, `rest-api`, `data-access` clean at their base branch tip, `mambu-push` with one local commit) exposed two defects in the plan above:

1. **Last-N default shows other people's history.** With base = HEAD~N, every repo with history lists the last N base-branch commits as "changes" (59 noise files in the user's workspace). The default scope is now **`{ kind: 'branch' }`** ("Current branch"): base = `merge-base(HEAD, baseRef)` per repo, where `baseRef` is the first verifiable ref of `symbolic-ref refs/remotes/origin/HEAD` (shortened), then `origin/master`, `origin/main`, `master`, `main`. No divergence → base = HEAD → clean repos list nothing. No detectable base branch → base = HEAD (`branch-no-base`). Stashes are never included. Last-N and date-range scopes remain available via the scope picker, which now opens from the retitled **"Set Scope"** command (`review-surface.setScopeDateRange`, same ID) with items: Current branch, Last 24 hours, Last 3 days, Last week, Last N commits…, Custom range….
2. **`review-surface-base:` URIs did not survive `Uri.parse → toString`.** Query-string URIs get their `=`/`&` re-encoded by VS Code's URI serializer, so `decodeBaseUri(uri.toString())` returned empty parts and the diff's left side was blank. Base URIs now carry a base64url-encoded JSON payload in the path segment (`review-surface-base:<base64url>`), which round-trips byte-identically (verified with the `vscode-uri` package). `decodeBaseUri` still accepts the legacy query format as a fallback. `DiffOpener`/`BaseContentProvider` are unchanged (they already use the single encode/decode pair).
3. **Read-only observable.** Session read-only blocks content changes, but `editor.edit` still resolves `true` (the edit is silently dropped). Integration tests assert the observable effect — document text unchanged while read-only — not the return value (§13.7 step 7).
4. **Tests added.** Unit: branch merge-base resolution, on-base equality, no-base HEAD fallback, no widening toward stale upstreams; coordinator branch label. Integration (`branchScope.test.ts` last in `SUITE_FILES`): feature-branch repo lists only its local files + untracked, clean repo at base tip lists nothing, scope label is `Current branch`. `diffEscapeHatch.test.ts` now dirties a file that exists at the base and asserts the base side is non-blank and differs from the working file (the old version passed vacuously with empty-vs-empty).
5. **Verified against the user's workspace** with the production collector: branch scope yields exactly the 5 `mambu-push` files at base `60215f4` (origin/master); akili-crm/rest-api/data-access yield nothing.

---

## 18. Definition of done

- Every requirement in `start.md` sections 1.1, 1.2, 1.3, 2, and 3 has a file location in this plan and an assertion in unit or integration tests.
- Section 1.4 features are absent.
- `npm run compile`, `npm run lint`, `npm run build`, `npm run test:unit`, and `npm run test:integration` all exit 0.
- Opening a changed file shows the **current** file in a normal editor, whole-line background tint on added/modified lines, gutter + overview ruler, read-only until the user toggles edit, and highlights survive that toggle.
- Diff view opens only through the escape hatches, using `review-surface-base:` vs the file uri.
- One tree lists every repo in the workspace, pruned, with a flat-list toggle and a visible scope control for last N and date ranges, always including unstaged, staged, untracked, and unpushed changes.
