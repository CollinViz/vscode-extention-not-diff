import {
  CFG_DEFAULT_COMMIT_COUNT,
  CMD_ENABLE_EDIT_MODE,
  CMD_ENABLE_READ_ONLY,
  CMD_INTERNAL_SET_SCOPE,
  CMD_INTERNAL_STATE,
  CMD_INTERNAL_TREE,
  CMD_NEXT_CHANGE,
  CMD_OPEN_DIFF,
  CMD_OPEN_FILE,
  CMD_PREV_CHANGE,
  CMD_REFRESH,
  CMD_SET_SCOPE_DATE_RANGE,
  CMD_SET_SCOPE_LAST_N,
  CMD_SHOW_FLAT_VIEW,
  CMD_SHOW_TREE_VIEW,
  CMD_CLEAR_REVIEWED,
  CMD_DISABLE_DIM_UNCHANGED,
  CMD_ENABLE_DIM_UNCHANGED,
  CMD_MARK_ALL_REVIEWED,
  CMD_TOGGLE_DIM_UNCHANGED,
  CMD_TOGGLE_EDIT_MODE,
  CMD_TOGGLE_REVIEWED,
  CMD_TOGGLE_VIEW_MODE,
  CTX_DIM_UNCHANGED,
  TEST_ENV_ENABLED,
  TEST_ENV_VAR
} from '../config/identifiers';
import { CHANGE_DIRECTION_NEXT, CHANGE_DIRECTION_PREVIOUS, DEFAULT_COMMIT_COUNT, MIN_COMMIT_COUNT } from '../config/constants';
import { fileKeyOf } from '../application/ReviewCoordinator';
import type { ReviewCoordinator } from '../application/ReviewCoordinator';
import type { ChangedFile, ReviewScope } from '../domain/models';
import { encodeBaseUri } from '../util/reviewUri';
import { absoluteFromRoot, toPosixPath } from '../util/paths';
import type { DiffDecorationManager } from './DiffDecorationManager';
import { openDiffVsBase } from './DiffOpener';
import type { ReadOnlySessionController } from './ReadOnlySessionController';
import type { ReviewTreeDataProvider } from './ReviewTreeDataProvider';
import { CUSTOM_DATE_PLACEHOLDER, SCOPE_BRANCH_ID, SCOPE_PRESET_ITEMS } from './scopePrompts';
import type { OpenFileArgs } from './treeItemFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export interface CommandContext {
  vscode: VscodeLike;
  coordinator: ReviewCoordinator;
  treeProvider: ReviewTreeDataProvider;
  decorations: DiffDecorationManager;
  readOnly: ReadOnlySessionController;
}

export function registerCommands(context: CommandContext): VscodeLike[] {
  const { vscode, coordinator, treeProvider, decorations, readOnly } = context;
  void treeProvider;
  const disposables: VscodeLike[] = [];

  disposables.push(
    vscode.commands.registerCommand(CMD_REFRESH, async () => {
      await coordinator.refresh();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_TOGGLE_VIEW_MODE, async () => {
      await coordinator.toggleViewMode();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_SHOW_FLAT_VIEW, async () => {
      if (coordinator.getSnapshot().viewMode !== 'flat') {
        await coordinator.toggleViewMode();
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_SHOW_TREE_VIEW, async () => {
      if (coordinator.getSnapshot().viewMode !== 'tree') {
        await coordinator.toggleViewMode();
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_SET_SCOPE_LAST_N, async () => {
      await promptLastN(vscode, coordinator);
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_SET_SCOPE_DATE_RANGE, async () => {
      await promptScope(vscode, coordinator);
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_OPEN_FILE, async (args: OpenFileArgs) => {
      await readOnly.openReviewFile(args);
      decorations.refreshForEditor(vscode.window.activeTextEditor);
      await readOnly.syncActiveEditor();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_OPEN_DIFF, async (args?: Partial<OpenFileArgs>) => {
      await openDiffVsBase(
        vscode,
        encodeBaseUri,
        () => findActiveChangedFile(vscode, coordinator),
        args?.repoRoot ? (args as OpenFileArgs) : undefined
      );
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_TOGGLE_EDIT_MODE, async () => {
      await readOnly.toggleEditMode();
      decorations.refreshForEditor(vscode.window.activeTextEditor);
      await readOnly.syncActiveEditor();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_ENABLE_EDIT_MODE, async () => {
      const snapshot = await buildTestSnapshot(vscode, coordinator, decorations, readOnly);
      const posture = (snapshot as { activeEditor?: { posture?: string } | null }).activeEditor?.posture;
      if (posture === 'read-only') {
        await readOnly.toggleEditMode();
        decorations.refreshForEditor(vscode.window.activeTextEditor);
        await readOnly.syncActiveEditor();
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_ENABLE_READ_ONLY, async () => {
      const snapshot = await buildTestSnapshot(vscode, coordinator, decorations, readOnly);
      const posture = (snapshot as { activeEditor?: { posture?: string } | null }).activeEditor?.posture;
      if (posture === 'editing') {
        await readOnly.toggleEditMode();
        decorations.refreshForEditor(vscode.window.activeTextEditor);
        await readOnly.syncActiveEditor();
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_NEXT_CHANGE, async () => {
      await decorations.goToChange(CHANGE_DIRECTION_NEXT);
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_PREV_CHANGE, async () => {
      await decorations.goToChange(CHANGE_DIRECTION_PREVIOUS);
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_TOGGLE_REVIEWED, async (item?: { id?: unknown }) => {
      const key = resolveReviewedKey(vscode, coordinator, item);
      if (key !== null) {
        coordinator.toggleReviewed(key);
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_MARK_ALL_REVIEWED, () => {
      coordinator.markAllReviewed();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_CLEAR_REVIEWED, () => {
      coordinator.clearReviewed();
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_TOGGLE_DIM_UNCHANGED, async () => {
      await setDimUnchanged(vscode, decorations, !decorations.isDimUnchanged());
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_ENABLE_DIM_UNCHANGED, async () => {
      await setDimUnchanged(vscode, decorations, true);
    })
  );

  disposables.push(
    vscode.commands.registerCommand(CMD_DISABLE_DIM_UNCHANGED, async () => {
      await setDimUnchanged(vscode, decorations, false);
    })
  );

  if (process.env[TEST_ENV_VAR] === TEST_ENV_ENABLED) {
    disposables.push(
      vscode.commands.registerCommand(CMD_INTERNAL_STATE, async () => buildTestSnapshot(vscode, coordinator, decorations, readOnly))
    );
    disposables.push(
      vscode.commands.registerCommand(CMD_INTERNAL_TREE, async () => {
        const snapshot = coordinator.getSnapshot();
        return JSON.parse(
          JSON.stringify(
            snapshot.tree.map((node) => serializeTree(node, []))
          )
        );
      })
    );
    disposables.push(
      vscode.commands.registerCommand(CMD_INTERNAL_SET_SCOPE, async (scope: ReviewScope) => {
        await coordinator.setScope(scope);
        return buildTestSnapshot(vscode, coordinator, decorations, readOnly);
      })
    );
  }

  return disposables;
}

async function promptLastN(vscode: VscodeLike, coordinator: ReviewCoordinator): Promise<void> {
  const configuredDefault = vscode.workspace.getConfiguration().get(CFG_DEFAULT_COMMIT_COUNT, DEFAULT_COMMIT_COUNT);
  const raw = await vscode.window.showInputBox({
    prompt: 'Show changes from the last N commits',
    placeHolder: String(configuredDefault),
    validateInput: (value: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < MIN_COMMIT_COUNT) {
        return `Enter an integer >= ${MIN_COMMIT_COUNT}`;
      }
      return null;
    }
  });
  if (raw === undefined) {
    return;
  }
  try {
    await coordinator.setLastN(Number(raw));
  } catch (error) {
    await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function promptScope(vscode: VscodeLike, coordinator: ReviewCoordinator): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    SCOPE_PRESET_ITEMS.map((item) => ({ label: item.label, presetId: item.presetId })),
    { placeHolder: 'Select a review scope' }
  );
  if (!picked) {
    return;
  }
  try {
    if (picked.presetId === SCOPE_BRANCH_ID) {
      await coordinator.setScope({ kind: 'branch' });
    } else if (picked.presetId === 'last-n') {
      await promptLastN(vscode, coordinator);
    } else if (picked.presetId === 'custom') {
      const start = await vscode.window.showInputBox({ prompt: 'Start date', placeHolder: CUSTOM_DATE_PLACEHOLDER });
      if (!start) {
        return;
      }
      const end = await vscode.window.showInputBox({ prompt: 'End date', placeHolder: CUSTOM_DATE_PLACEHOLDER });
      if (!end) {
        return;
      }
      await coordinator.setCustomDateRange(start, end);
    } else {
      await coordinator.setDatePreset(picked.presetId);
    }
  } catch (error) {
    await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

async function setDimUnchanged(vscode: VscodeLike, decorations: DiffDecorationManager, enabled: boolean): Promise<void> {
  decorations.setDimUnchanged(enabled);
  await vscode.commands.executeCommand('setContext', CTX_DIM_UNCHANGED, enabled);
  decorations.refreshForEditor(vscode.window.activeTextEditor);
}

function findActiveChangedFile(
  vscode: VscodeLike,
  coordinator: ReviewCoordinator
): { repoRoot: string; baseCommit: string; relativePath: string; previousPath: string | null } | null {
  const file = activeChangedFile(vscode, coordinator);
  if (!file) {
    return null;
  }
  return { repoRoot: file.repo.rootPath, baseCommit: file.baseCommit, relativePath: file.relativePath, previousPath: file.previousPath };
}

function activeChangedFile(vscode: VscodeLike, coordinator: ReviewCoordinator): ChangedFile | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') {
    return null;
  }
  const fsPath = toPosixPath(editor.document.uri.fsPath);
  const snapshot = coordinator.getSnapshot();
  for (const file of snapshot.files) {
    if (toPosixPath(absoluteFromRoot(file.repo.rootPath, file.relativePath)) === fsPath) {
      return file;
    }
  }
  return null;
}

/**
 * The reviewed key for a tree context-menu invocation is the tree item id
 * (`repoId::relativePath`). Palette invocations fall back to the active
 * editor's file in the current snapshot.
 */
function resolveReviewedKey(vscode: VscodeLike, coordinator: ReviewCoordinator, item?: { id?: unknown }): string | null {
  if (typeof item?.id === 'string' && item.id !== '') {
    return item.id;
  }
  const file = activeChangedFile(vscode, coordinator);
  return file ? fileKeyOf(file) : null;
}

async function buildTestSnapshot(
  vscode: VscodeLike,
  coordinator: ReviewCoordinator,
  decorations: DiffDecorationManager,
  readOnly: ReadOnlySessionController
): Promise<unknown> {
  const snapshot = coordinator.getSnapshot();
  const editor = vscode.window.activeTextEditor;
  return {
    viewMode: snapshot.viewMode,
    scopeLabel: snapshot.scopeLabel,
    scope: snapshot.scope,
    fileCount: snapshot.files.length,
    fileKeys: snapshot.files.map((file) => `${file.repo.id}::${toPosixPath(file.relativePath)}`),
    reviewedKeys: [...coordinator.getReviewedKeys()],
    dimUnchanged: decorations.isDimUnchanged(),
    dimmedLineCount: editor ? decorations.dimmedLineCountFor(editor.document.uri.fsPath) : 0,
    errors: snapshot.errors,
    files: snapshot.files.map((file) => ({
      repoRoot: file.repo.rootPath,
      repoId: file.repo.id,
      repoName: file.repo.name,
      relativePath: toPosixPath(file.relativePath),
      previousPath: file.previousPath,
      baseCommit: file.baseCommit,
      kind: file.kind
    })),
    tree: snapshot.tree.map((node) => serializeTree(node, [])),
    activeEditor: editor
      ? {
          uri: editor.document.uri.toString(),
          scheme: editor.document.uri.scheme,
          fsPath: editor.document.uri.fsPath,
          isReviewSession: readOnly.isReviewSession(editor.document.uri.fsPath),
          posture: readOnly.postureFor(editor.document.uri.fsPath) ?? 'none',
          decorationLineCount: decorations.decorationLineCountFor(editor.document.uri.fsPath)
        }
      : null
  };
}

interface SerializedTreeNode {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly kind: string;
  readonly additions: number;
  readonly deletions: number;
  readonly reviewed: boolean;
  readonly children: readonly SerializedTreeNode[];
}

function serializeTree(node: SerializedTreeNode, parents: string[]): unknown {
  return {
    id: node.id,
    label: node.label,
    description: node.description,
    kind: node.kind,
    additions: node.additions,
    deletions: node.deletions,
    reviewed: node.reviewed,
    parentLabels: parents,
    children: node.children.map((child) => serializeTree(child, [...parents, node.label]))
  };
}
