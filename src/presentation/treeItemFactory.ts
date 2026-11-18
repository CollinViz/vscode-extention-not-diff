import { CMD_OPEN_FILE } from '../config/identifiers';
import type { ChangeKind, FileTreeNode } from '../domain/models';
import { absoluteFromRoot } from '../util/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export interface OpenFileArgs {
  readonly repoRoot: string;
  readonly repoId: string;
  readonly relativePath: string;
  readonly previousPath: string | null;
  readonly baseCommit: string;
  readonly kind: string;
}

const CHANGE_KIND_THEME_ICON: Record<ChangeKind, string> = {
  added: 'add',
  modified: 'edit',
  deleted: 'trash',
  renamed: 'diff-renamed',
  copied: 'files',
  untracked: 'question',
  unmerged: 'warning'
};

export function changeKindIcon(changeKind: ChangeKind | null): string {
  if (changeKind === null) {
    return 'folder';
  }
  return CHANGE_KIND_THEME_ICON[changeKind];
}

export function toTreeItem(vscode: VscodeLike, node: FileTreeNode): VscodeLike {
  if (node.kind === 'file') {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.id = node.id;
    item.description = node.description;
    item.tooltip = `${node.description} · ${node.relativePath ?? node.label} · ${node.changeKind ?? ''}`;
    item.contextValue = 'reviewSurface.file';
    const repoRoot = node.repoId ?? '';
    if (repoRoot !== '' && node.relativePath && node.changeKind !== 'deleted') {
      try {
        item.resourceUri = vscode.Uri.file(absoluteFromRoot(repoRoot, node.relativePath));
      } catch {
        // leave resourceUri unset when the path cannot be resolved
      }
    }
    item.iconPath = new vscode.ThemeIcon(changeKindIcon(node.changeKind));
    item.command = {
      command: CMD_OPEN_FILE,
      title: 'Open File in Review Surface',
      arguments: [
        {
          repoRoot,
          repoId: node.repoId ?? '',
          relativePath: node.relativePath ?? node.label,
          previousPath: node.previousPath,
          baseCommit: node.baseCommit ?? '',
          kind: node.changeKind ?? 'modified'
        } satisfies OpenFileArgs
      ]
    };
    return item;
  }
  const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
  item.id = node.id;
  item.description = node.description;
  item.iconPath = new vscode.ThemeIcon(node.kind === 'repo' ? 'repo' : 'folder');
  item.contextValue = node.kind === 'repo' ? 'reviewSurface.repo' : 'reviewSurface.directory';
  return item;
}
