import { STATUS_BAR_PRIORITY } from '../config/constants';
import { CMD_TOGGLE_EDIT_MODE, CTX_READ_ONLY, CTX_REVIEW_FILE } from '../config/identifiers';
import type { IFileSystem, IReadOnlyAdapter } from '../domain/ports';
import { absoluteFromRoot } from '../util/paths';
import type { OpenFileArgs } from './treeItemFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export type ReviewPosture = 'read-only' | 'editing';

export class ReadOnlySessionController {
  private readonly sessions = new Set<string>();
  private readonly postureByUri = new Map<string, ReviewPosture>();
  private statusItem: VscodeLike | null = null;

  constructor(
    private readonly vscode: VscodeLike,
    private readonly readOnlyAdapter: IReadOnlyAdapter,
    private readonly fs: IFileSystem,
    private readonly openDiff: (args?: Partial<OpenFileArgs>) => Promise<void>
  ) {}

  sessionUris(): readonly string[] {
    return [...this.sessions];
  }

  isReviewSession(fsPath: string): boolean {
    return this.sessions.has(fsPath);
  }

  postureFor(fsPath: string): ReviewPosture | null {
    return this.postureByUri.get(fsPath) ?? null;
  }

  async openReviewFile(args: OpenFileArgs): Promise<void> {
    if (args.kind === 'deleted') {
      this.trackSessionForDeleted(args);
      await this.openDiff(args);
      return;
    }
    const absolute = absoluteFromRoot(args.repoRoot, args.relativePath);
    if (!(await this.fs.exists(absolute))) {
      this.trackSessionForDeleted(args);
      await this.openDiff(args);
      return;
    }
    const document = await this.vscode.workspace.openTextDocument(this.vscode.Uri.file(absolute));
    await this.vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
    const key = document.uri.fsPath;
    this.sessions.add(key);
    // Set posture and UI state in one function so they cannot diverge.
    await this.applyPosture(key, 'read-only');
  }

  async toggleEditMode(): Promise<void> {
    const editor = this.vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const key = editor.document.uri.fsPath;
    if (!this.sessions.has(key)) {
      return;
    }
    const current = this.postureByUri.get(key) ?? 'read-only';
    const next: ReviewPosture = current === 'read-only' ? 'editing' : 'read-only';
    await this.applyPosture(key, next);
  }

  async syncActiveEditor(): Promise<void> {
    const editor = this.vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      this.hideStatus();
      return;
    }
    const key = editor.document.uri.fsPath;
    if (!this.sessions.has(key)) {
      await this.setContext(CTX_REVIEW_FILE, false);
      this.hideStatus();
      return;
    }
    const posture = this.postureByUri.get(key) ?? 'read-only';
    await this.setContext(CTX_REVIEW_FILE, true);
    await this.setContext(CTX_READ_ONLY, posture === 'read-only');
    this.showStatus(posture);
  }

  // applyPosture keeps the adapter, context keys, and status bar text in sync.
  // The integration test asserts snapshot posture; status text is derived from the same value.
  private async applyPosture(key: string, posture: ReviewPosture): Promise<void> {
    this.postureByUri.set(key, posture);
    await this.readOnlyAdapter.setSessionReadOnly(posture === 'read-only');
    await this.setContext(CTX_REVIEW_FILE, true);
    await this.setContext(CTX_READ_ONLY, posture === 'read-only');
    this.showStatus(posture);
  }

  private trackSessionForDeleted(args: OpenFileArgs): void {
    const absolute = absoluteFromRoot(args.repoRoot, args.relativePath);
    this.sessions.add(absolute);
    this.postureByUri.set(absolute, 'read-only');
  }

  private showStatus(posture: ReviewPosture): void {
    if (!this.statusItem) {
      this.statusItem = this.vscode.window.createStatusBarItem(this.vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
      this.statusItem.command = CMD_TOGGLE_EDIT_MODE;
    }
    this.statusItem.text = posture === 'read-only' ? 'Review: Read-Only' : 'Review: Editing';
    this.statusItem.tooltip = 'Toggle review edit mode';
    this.statusItem.show();
  }

  private hideStatus(): void {
    this.statusItem?.hide();
  }

  private async setContext(key: string, value: boolean): Promise<void> {
    await this.vscode.commands.executeCommand('setContext', key, value);
  }
}
