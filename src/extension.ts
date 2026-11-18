import * as vscode from 'vscode';
import { ReviewCoordinator } from './application/ReviewCoordinator';
import { DEBOUNCE_REFRESH_MS } from './config/constants';
import { CFG_DEBOUNCE_MS as CFG_DEBOUNCE_KEY, CTX_VIEW_IS_TREE, SCHEME_BASE, VIEW_ID } from './config/identifiers';
import { GitChangeCollector } from './infrastructure/GitChangeCollector';
import { GitCliExecutor } from './infrastructure/GitCliExecutor';
import { MemoryReviewStateStore } from './infrastructure/MemoryReviewStateStore';
import { NodeClock } from './infrastructure/NodeClock';
import { NodeFileSystem } from './infrastructure/NodeFileSystem';
import { VsCodeReadOnlyAdapter } from './infrastructure/VsCodeReadOnlyAdapter';
import { WorkspaceRepoLocator } from './infrastructure/WorkspaceRepoLocator';
import { BaseContentProvider } from './presentation/BaseContentProvider';
import { registerCommands } from './presentation/CommandRegistrar';
import { DiffDecorationManager } from './presentation/DiffDecorationManager';
import { openDiffVsBase } from './presentation/DiffOpener';
import { ReadOnlySessionController } from './presentation/ReadOnlySessionController';
import { ReviewTreeDataProvider } from './presentation/ReviewTreeDataProvider';
import { encodeBaseUri } from './util/reviewUri';
import { DisposableStore } from './util/disposables';
import { absoluteFromRoot, toPosixPath } from './util/paths';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new DisposableStore();
  const git = new GitCliExecutor();
  const clock = new NodeClock();
  const fs = new NodeFileSystem();
  const state = new MemoryReviewStateStore();
  const debounceMs = vscode.workspace.getConfiguration().get<number>(CFG_DEBOUNCE_KEY, DEBOUNCE_REFRESH_MS);

  const locator = new WorkspaceRepoLocator(vscode);
  const collector = new GitChangeCollector(git, fs, clock);
  const coordinator = new ReviewCoordinator(state, locator, collector, clock, debounceMs);

  const treeProvider = new ReviewTreeDataProvider(vscode as unknown as never);
  const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: treeProvider as unknown as vscode.TreeDataProvider<never>, showCollapseAll: true });
  treeProvider.attachTreeView(treeView as unknown as never);
  context.subscriptions.push(treeView);

  const decorations = new DiffDecorationManager(vscode as unknown as never, context.extensionPath);
  const readOnlyAdapter = new VsCodeReadOnlyAdapter(vscode as unknown as never);

  const readOnly: ReadOnlySessionController = new ReadOnlySessionController(
    vscode as unknown as never,
    readOnlyAdapter,
    fs,
    async (args) => {
      await openDiffVsBase(
        vscode,
        encodeBaseUri,
        () => findActive(vscode, coordinator),
        args?.repoRoot ? { repoRoot: args.repoRoot ?? '', baseCommit: args.baseCommit ?? '', relativePath: args.relativePath ?? '', previousPath: args.previousPath ?? null } : undefined
      );
    }
  );

  const contentProvider = new BaseContentProvider(vscode as unknown as never, git);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME_BASE, contentProvider as unknown as vscode.TextDocumentContentProvider));

  coordinator.setListener({
    onSnapshot: (snapshot) => {
      treeProvider.onSnapshot(snapshot);
      decorations.setFiles(snapshot.files);
      decorations.refreshForEditor(vscode.window.activeTextEditor as unknown as never);
      void vscode.commands.executeCommand('setContext', CTX_VIEW_IS_TREE, snapshot.viewMode === 'tree');
    }
  });

  for (const disposable of registerCommands({ vscode: vscode as unknown as never, coordinator, treeProvider: treeProvider as unknown as never, decorations: decorations as unknown as never, readOnly: readOnly as unknown as never })) {
    context.subscriptions.push(disposable as unknown as vscode.Disposable);
  }

  context.subscriptions.push(
    locator.onDidChangeRepositories(() => coordinator.scheduleRefresh()) as unknown as vscode.Disposable,
    vscode.workspace.onDidChangeTextDocument(() => coordinator.scheduleRefresh()),
    vscode.workspace.onDidSaveTextDocument(() => coordinator.scheduleRefresh()),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      decorations.refreshForEditor(editor as unknown as never);
      await readOnly.syncActiveEditor();
      coordinator.scheduleRefresh();
    }),
    vscode.workspace.createFileSystemWatcher('**/*')
  );
  const watcher = context.subscriptions[context.subscriptions.length - 1] as vscode.FileSystemWatcher;
  store.add({ dispose: () => watcher.dispose() });
  void store;

  await vscode.commands.executeCommand('setContext', CTX_VIEW_IS_TREE, true);
  void coordinator.refresh();
  await readOnly.syncActiveEditor();
}

function findActive(
  vscodeApi: typeof vscode,
  coordinator: ReviewCoordinator
): { repoRoot: string; baseCommit: string; relativePath: string; previousPath: string | null } | null {
  const editor = vscodeApi.window.activeTextEditor;
  if (!editor || editor.document.uri.scheme !== 'file') {
    return null;
  }
  const fsPath = toPosixPath(editor.document.uri.fsPath);
  for (const file of coordinator.getSnapshot().files) {
    if (toPosixPath(absoluteFromRoot(file.repo.rootPath, file.relativePath)) === fsPath) {
      return { repoRoot: file.repo.rootPath, baseCommit: file.baseCommit, relativePath: file.relativePath, previousPath: file.previousPath };
    }
  }
  return null;
}

export function deactivate(): void {
  // Disposables are owned by the extension context.
}
