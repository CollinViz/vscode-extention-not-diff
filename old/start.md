You are a senior TypeScript and VS Code Extension Architect. Your task is to design, build, and thoroughly test a production-quality VS Code extension called **Review Surface**—a single, unified, live review surface for Git changes across every repository in a workspace.

Before writing code, carefully read every requirement, architectural constraint, and testing mandate below. Do not skip any requirement, and do not add out-of-scope features.

---

## 1. Product Specification

### Core Philosophy
Users should never have to open a traditional side-by-side diff view unless they explicitly ask for it. Instead, they inspect the **current working code in context** with changed lines clearly highlighted, starting in a safe read-only posture.

### 1.1 Changed Files View (Unified Multi-Repo List)
- **Single Unified View**: Aggregate changed files across **all** Git repositories discovered in the open workspace into one list (no switching repo contexts).
- **Repo Identification**: Every file entry must subtly display which repository it belongs to (e.g., via `TreeItem.description`, badge, or repo prefix/tag) without breaking the unified list experience.
- **Primary View — Pruned Directory Tree**:
  - Display the real directory hierarchy, pruned to **only** the folders and files that contain changes in the active scope.
  - Compact single-child directory chains if helpful or show clean nested folders so spatial context is preserved (e.g., `lib/utils/random.ts`, `lib/services/auth.ts`, `views/dashboard.tsx`).
  - In multi-repo workspaces, prevent path collisions across repositories (e.g., prefix root or group/badge cleanly while preserving spatial directory context).
- **Mode Switch — Flat List Toggle**:
  - Provide a prominent toggle action at the top of the view (`view/title`) that collapses the pruned tree into a flat list of changed files (and toggles back to tree view).
- **Top Scope Controls**:
  - Display the active scope clearly at the top of the view (e.g., `view.message` / `view.description` and toolbar actions).
  - Support switching between:
    1. **Last N commits** (Default: `10` commits per repository). Allow changing `N` via a quick input/picker.
    2. **Date-range picker**: Quick presets (`Last 24 hours`, `Last 3 days`, `Last week`) plus a `Custom range` option (start/end date input).
- **What Feeds the List (Git Scope Rules)**:
  - The list is the live source of truth for *"everything that moved in this window + local unfinished work"*.
  - **Always included** on top of the selected commit/date window:
    - Unstaged working-tree modifications
    - Staged (index) changes
    - Untracked (non-ignored) files
    - Unpushed local commits (e.g., commits in `@{u}..HEAD` when an upstream tracking branch exists)
  - Handle edge cases gracefully: repositories with fewer than `N` commits, root commits (diff against Git's empty tree hash), unborn `HEAD`, empty date windows that still have dirty working-tree files, renames, and deleted files.

### 1.2 Opening Files & Visual Treatment
- **Normal Code Editor**: Clicking a file in the list opens the actual current file in a normal VS Code text editor (not a diff editor). (For deleted files that no longer exist on disk, open the traditional diff or read-only base snapshot.)
- **Mandatory Background Highlight**:
  - Lines that were added or modified relative to the resolved comparison base **must** receive a clear, high-visibility background tint (`TextEditorDecorationType.backgroundColor` and `isWholeLine: true`). This is the primary visual signal.
  - Use theme-aware RGBA colors or `ThemeColor` contributions declared in `package.json` (`contributes.colors`) so highlights look crisp in both Light and Dark themes.
- **Secondary Gutter Markers & Diff Escape Hatch**:
  - Render subtle gutter markers + overview ruler indicators on changed lines.
  - Provide low-friction escape hatches to open the traditional `vscode.diff` view (comparing the resolved window base commit vs. the current file) whenever the user needs to inspect the old version:
    1. Clickable Markdown command links inside the decoration `hoverMessage` on changed lines (e.g., `"Peek / Open Diff vs. Base"`).
    2. Gutter / line-number right-click context menu (`editor/lineNumber/context`).
    3. Editor title bar button (`editor/title`) and registered command/keybinding.
  - *(Note: VS Code's `TextEditorDecorationType` API does not expose a native left-click event on gutter icons; therefore, hover command links + `editor/lineNumber/context` + editor title action + command palette ensure immediate, reliable access to the diff.)*
- **Live Sync**: Keep decorations and the file list updated automatically via file system watchers, Git repository state listeners, active editor switches, and debounced text document change events.

### 1.3 Read-Only by Default
- When a file is opened from the Review Surface list, the editor **must start in Read-Only mode** (`workbench.action.files.setActiveEditorReadonlyInSession`).
- Users can still scroll, search, fold, hover, jump to definition, and use IntelliSense—they simply cannot accidentally type.
- Provide a **low-friction toggle to switch into Edit mode** (and back to Read-Only):
  - Prominent Editor Title Bar icon/button (`editor/title`) controlled by a context key.
  - Status Bar indicator showing current posture (`Review: Read-Only` / `Review: Editing`) that toggles on click.
  - Dedicated command + convenient keyboard shortcut (e.g., `alt+r` / customizable keybinding).
- **Critical**: When switching to Edit mode, **all changed-line background highlights and gutter markers must remain visible**.

### 1.4 Explicitly Out of Scope (DO NOT IMPLEMENT)
- **No** "mark as reviewed" state, **no** checkboxes, **no** "done/approved" tracking, and **no** persisted review-completion metadata. The list solely reflects the current Git reality for the selected scope.

---

## 2. Engineering & Architecture Constraints (STRICT)

You **MUST** adhere strictly to **SOLID**, **DRY**, and **Zero Magic Numbers**:

### 2.1 No Magic Numbers or Magic Strings
- Create a dedicated `src/config/constants.ts` (and `src/config/defaults.ts` if appropriate) containing **all**:
  - Numeric constants (`DEFAULT_COMMIT_COUNT = 10`, `MIN_COMMIT_COUNT = 1`, `HOURS_PER_DAY = 24`, `DAYS_IN_WEEK = 7`, `THREE_DAYS = 3`, `MS_PER_HOUR`, `DEBOUNCE_REFRESH_MS`, `ZERO_DIFF_CONTEXT_LINES = 0`, `ONE_BASED_TO_ZERO_BASED_OFFSET = 1`, RGBA alpha values, etc.).
  - Git constants (`GIT_EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'`, `GIT_COMMAND = 'git'`, status codes).
  - Extension IDs, command IDs, view IDs, context keys, URI schemes (`review-surface-base`), configuration keys, and color IDs.
- No inline unexplained numeric literals (`10`, `86400000`, `300`, `1`, etc.) or duplicated string identifiers anywhere in business logic or presentation code.

### 2.2 SOLID Architecture & Layer Separation
Organize `src/` with strict dependency inversion (inner layers must **never** import `vscode` so domain logic is 100% unit-testable without VS Code):

1. **`src/config/`**: Constants, typed configuration definitions, command/context identifiers.
2. **`src/domain/`** *(Pure TypeScript — ZERO `vscode` imports)*:
   - `models.ts`: Immutable domain types (`RepositoryDescriptor`, `ReviewScope`, `ChangedFile`, `ChangeKind`, `LineRange`, `FileTreeNode`, `ViewMode`, `DiffHunk`).
   - `ports.ts`: Narrow, segregated interfaces (`IGitExecutor`, `IRepositoryDiscovery`, `IClock`, `IFileSystem`, `IReadOnlyAdapter`, `IReviewStateStore`).
   - `DiffHunkParser.ts`: Pure parser for `git diff --unified=0` output into zero-based `LineRange[]`.
   - `ScopeBaseResolver.ts`: Pure strategy/service computing the comparison base commit per repository given `ReviewScope` (Last N commits vs. Date Range + unpushed commits + empty tree / `HEAD` fallback).
   - `FileTreeBuilder.ts`: Pure transformer converting `ChangedFile[]` into either a pruned hierarchical tree (`FileTreeNode[]`) or a flat list (`FileTreeNode[]`), including multi-repo disambiguation and sorting (directories first, alphabetical).
3. **`src/infrastructure/`**:
   - `GitCliExecutor.ts`: Executes `git` safely via `child_process.execFile` (never shell string interpolation, preventing command injection).
   - `WorkspaceRepoLocator.ts`: Combines `vscode.git` extension API (`getAPI(1).repositories`) with workspace folder `.git` detection.
   - `GitChangeCollector.ts`: Implements change aggregation across repos using `ScopeBaseResolver` and `DiffHunkParser` (staged, unstaged, untracked, unpushed, scoped commits).
4. **`src/application/`**:
   - `ReviewCoordinator.ts`: Single orchestrator coordinating scope changes, view-mode toggles, refresh debouncing, and multi-repo collection.
5. **`src/presentation/`**:
   - `ReviewTreeDataProvider.ts`: Adapts `FileTreeNode[]` into `vscode.TreeItem`s with repo badges, change-kind decorations, and dynamic view message/description.
   - `DiffDecorationManager.ts`: Manages `TextEditorDecorationType` instances (mandatory background tint + gutter icon + overview ruler + hover command links).
   - `ReadOnlySessionController.ts`: Manages read-only-by-default opening, edit/lock toggling, context keys, and status bar item.
   - `BaseContentProvider.ts`: Implements `vscode.TextDocumentContentProvider` for `review-surface-base:` URIs to power the `vscode.diff` escape hatch.
   - `CommandRegistrar.ts`: Registers all commands cleanly, delegating to application/presentation services.
6. **`src/extension.ts`**: Thin composition root wiring dependencies and disposables cleanly.

### 2.3 DRY Principle
- Factor shared Git argument builders, URI encoding/decoding helpers, path normalization (POSIX vs. Windows separators), disposable management, and error formatting into single reusable utilities.
- Do not duplicate diff parsing or tree/flat sorting logic between production code and tests.

---

## 3. Build & Testing Requirements (MANDATORY)

You must write **and execute** both unit tests and VS Code Extension Host integration tests, ensuring everything compiles, lints cleanly, and passes.

### 3.1 Unit Tests (Fast, Isolated, No VS Code Host Required)
Use Vitest or Mocha (with `ts-node`/compiled JS) to test `src/domain/` and `src/application/` with mocked ports (`IGitExecutor`, `IClock`, etc.):
- **DiffHunkParser**: Single-line additions, multi-line additions, modifications, pure deletions (no crash / proper mapping), multiple hunks in one file, binary/empty diffs, 1-based to 0-based conversion.
- **ScopeBaseResolver**:
  - Default last `N` commits (`N = 10`).
  - Repo with fewer than `N` commits (falls back to `GIT_EMPTY_TREE_HASH`).
  - Date range presets (`24h`, `3d`, `1w`) and custom range.
  - Empty date range with dirty working tree (falls back to `HEAD`).
  - Unpushed commits older than the date window or beyond `N` commits are still included in the base calculation.
- **FileTreeBuilder**:
  - Pruned tree omits untouched sibling directories/files.
  - Toggling to flat list preserves all files and repo badges.
  - Multi-repo files with identical relative paths (e.g., `repo-a/src/index.ts` and `repo-b/src/index.ts`) do not collide.
- **ReviewCoordinator**: Scope updates, view mode toggling, multi-repo aggregation, no "mark as reviewed" state leakage.

### 3.2 Integration Tests (Real VS Code Extension Host + Real Git Repos)
Use `@vscode/test-electron` (or `@vscode/test-cli` + Mocha) inside a real VS Code instance with temporary multi-repo workspaces created in `os.tmpdir()`:
1. **Multi-Repo Discovery & Pruned Tree**: Initialize 2 separate Git repos (`repoA`, `repoB`) inside a workspace, create commits and uncommitted edits in both, verify the TreeDataProvider yields changed files from both repos with proper pruned hierarchy and repo badges.
2. **Flat List Toggle**: Execute the toggle command and verify the tree collapses into a flat list containing the exact same changed files.
3. **Scope Switching**: Add >10 commits, verify default (`10`) excludes older untouched commits while including working tree + unpushed commits; switch `N` and date-range scopes and verify the list updates accordingly.
4. **Read-Only Default & Edit Toggle**: Execute the "open file from review surface" command, assert the file opens in the active editor, verify read-only state/context is active, execute the toggle-edit-mode command, and verify edit mode becomes writable while decorations remain applied.
5. **Diff Escape Hatch**: Invoke the "open diff vs base" command for a changed file and verify a diff tab opens (`tab.input instanceof vscode.TabInputTextDiff`) comparing the `review-surface-base:` URI against the workspace file URI.

---

## 4. Execution Workflow

Follow these steps in order:
1. Initialize the project (`package.json`, `tsconfig.json` with `"strict": true`, ESLint config, bundler/build script with `esbuild` or `tsc`, test configs).
2. Create `package.json` contributions (`viewsContainers`, `views`, `commands`, `menus` including `view/title`, `editor/title`, `editor/lineNumber/context`, `keybindings`, `colors`, `configuration`).
3. Create SVG/PNG icons for the activity bar container, gutter marker, and toolbar actions so the extension renders cleanly with no missing asset errors.
4. Implement `src/config/`, `src/domain/`, `src/infrastructure/`, `src/application/`, `src/presentation/`, and `src/extension.ts`.
5. Implement all unit tests and VS Code Extension Host integration tests.
6. Run:
   - Typecheck (`tsc --noEmit`)
   - Lint
   - Build
   - Unit test suite
   - Integration test suite
7. Review your entire codebase against **SOLID**, **DRY**, and **Zero Magic Numbers**, fix any issues, re-run all checks, and present a concise summary of the architecture, commands, and test results.