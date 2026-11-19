import { join } from 'node:path';
import { CMD_OPEN_DIFF, COLOR_CHANGED_LINE_BG } from '../config/identifiers';
import { CHANGE_BAR_COLOR, ICON_GUTTER_CHANGED } from '../config/constants';
import { changeLinesOf, findAdjacentChangeLine, type ChangeDirection } from '../domain/changeNavigation';
import type { ChangedFile } from '../domain/models';
import { absoluteFromRoot, toPosixPath } from '../util/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export class DiffDecorationManager {
  private readonly changedType: VscodeLike;
  private readonly deletionType: VscodeLike;
  private files: readonly ChangedFile[] = [];

  constructor(private readonly vscode: VscodeLike, private readonly extensionPath: string) {
    const gutterIconPath = vscode.Uri.file(join(extensionPath, 'media', ICON_GUTTER_CHANGED));
    this.changedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor(COLOR_CHANGED_LINE_BG),
      overviewRulerColor: CHANGE_BAR_COLOR,
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      gutterIconPath,
      gutterIconSize: 'contain'
    });
    this.deletionType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      overviewRulerColor: CHANGE_BAR_COLOR,
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      gutterIconPath,
      gutterIconSize: 'contain'
    });
  }

  setFiles(files: readonly ChangedFile[]): void {
    this.files = files;
  }

  refreshForEditor(editor: VscodeLike | undefined): void {
    if (!editor) {
      return;
    }
    const file = this.findFile(editor.document.uri.fsPath);
    if (!file) {
      editor.setDecorations(this.changedType, []);
      editor.setDecorations(this.deletionType, []);
      return;
    }
    const hoverMessage = new this.vscode.MarkdownString(`[Open Diff vs Base](command:${CMD_OPEN_DIFF})`);
    hoverMessage.isTrusted = true;
    const changedRanges: VscodeLike[] = [];
    for (const range of file.ranges) {
      const vsRange = new this.vscode.Range(range.start, 0, Math.max(range.end - 1, range.start), Number.MAX_SAFE_INTEGER);
      changedRanges.push({ range: vsRange, hoverMessage });
    }
    editor.setDecorations(this.changedType, changedRanges);
    const deletionRanges = file.deletionAnchors.map((line) => ({
      range: new this.vscode.Range(line, 0, line, 0),
      hoverMessage
    }));
    editor.setDecorations(this.deletionType, deletionRanges);
  }

  decorationLineCountFor(fsPath: string): number {
    const file = this.findFile(fsPath);
    if (!file) {
      return 0;
    }
    const rangeLines = file.ranges.reduce((total, range) => total + Math.max(range.end - range.start, 0), 0);
    return rangeLines + file.deletionAnchors.length;
  }

  /** The snapshot file backing an editor document, or undefined. */
  fileFor(fsPath: string): ChangedFile | undefined {
    return this.findFile(fsPath);
  }

  /** Every file in the current snapshot (read-only view of the review set). */
  snapshotFiles(): readonly ChangedFile[] {
    return this.files;
  }

  dispose(): void {
    this.changedType.dispose();
    this.deletionType.dispose();
  }

  async goToChange(direction: ChangeDirection): Promise<boolean> {
    const editor = this.vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return false;
    }
    const file = this.findFile(editor.document.uri.fsPath);
    if (!file) {
      return false;
    }
    const lines = changeLinesOf(file.ranges, file.deletionAnchors);
    const target = findAdjacentChangeLine(lines, editor.selection.active.line, direction);
    if (!target) {
      return false;
    }
    const position = new this.vscode.Position(target.line, 0);
    editor.selection = new this.vscode.Selection(position, position);
    editor.revealRange(new this.vscode.Range(position, position));
    return true;
  }

  private findFile(fsPath: string): ChangedFile | undefined {
    const normalized = toPosixPath(fsPath);
    return this.files.find((file) => toPosixPath(absoluteFromRoot(file.repo.rootPath, file.relativePath)) === normalized);
  }
}
