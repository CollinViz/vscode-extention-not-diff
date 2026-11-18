import type { FileTreeNode } from '../domain/models';
import type { ReviewSnapshot } from '../domain/ports';
import { toTreeItem } from './treeItemFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export function formatViewMessage(snapshot: ReviewSnapshot): string {
  if (snapshot.files.length === 0 && snapshot.errors.length === 0) {
    return 'No changes in this scope';
  }
  if (snapshot.errors.length > 0) {
    return `${snapshot.scopeLabel} · ${snapshot.errors.length} repo error(s)`;
  }
  return snapshot.scopeLabel;
}

export class ReviewTreeDataProvider {
  private readonly changeEmitter: VscodeLike;
  readonly onDidChangeTreeData: VscodeLike;
  private snapshot: ReviewSnapshot | null = null;
  private treeView: VscodeLike | null = null;

  constructor(private readonly vscode: VscodeLike) {
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
  }

  attachTreeView(treeView: VscodeLike): void {
    this.treeView = treeView;
  }

  onSnapshot(snapshot: ReviewSnapshot): void {
    this.snapshot = snapshot;
    this.changeEmitter.fire(undefined);
    if (this.treeView) {
      this.treeView.message = formatViewMessage(snapshot);
      this.treeView.description = snapshot.scopeLabel;
      try {
        this.treeView.badge = { value: snapshot.files.length, tooltip: 'Changed files' };
      } catch {
        // badge API may be unavailable on older versions
      }
    }
  }

  getTreeItem(node: FileTreeNode): VscodeLike {
    return toTreeItem(this.vscode, node);
  }

  getChildren(node?: FileTreeNode): FileTreeNode[] {
    if (!this.snapshot) {
      return [];
    }
    if (!node) {
      return [...this.snapshot.tree];
    }
    return [...node.children];
  }

  getParent?(node: FileTreeNode): undefined {
    void node;
    return undefined;
  }
}
