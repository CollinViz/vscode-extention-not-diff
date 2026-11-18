import { join } from 'node:path';
import { COLOR_ADDED_LINE_BG, COLOR_MODIFIED_LINE_BG, CMD_OPEN_DIFF } from '../config/identifiers';
import { ICON_GUTTER_CHANGED } from '../config/constants';
import { changeLinesOf, findAdjacentChangeLine, type ChangeDirection } from '../domain/changeNavigation';
import type { ChangedFile } from '../domain/models';
import { absoluteFromRoot, toPosixPath } from '../util/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export class DiffDecorationManager {
  private readonly addedType: VscodeLike;
  private readonly modifiedType: VscodeLike;
  private readonly deletionType: VscodeLike;
  private files: readonly ChangedFile[] = [];

  constructor(private readonly vscode: VscodeLike, private readonly extensionPath: string) {
    const gutterIconPath = vscode.Uri.file(join(extensionPath, 'media', ICON_GUTTER_CHANGED));
    this.addedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor(COLOR_ADDED_LINE_BG),
      overviewRulerColor: new vscode.ThemeColor(COLOR_ADDED_LINE_BG),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      gutterIconPath,
      gutterIconSize: 'contain'
    });
    this.modifiedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor(COLOR_MODIFIED_LINE_BG),
      overviewRulerColor: new vscode.ThemeColor(COLOR_MODIFIED_LINE_BG),
      overviewRulerLane: vscode.OverviewRulerLane.Full,
      gutterIconPath,
      gutterIconSize: 'contain'
    });
    this.deletionType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      overviewRulerColor: new vscode.ThemeColor(COLOR_MODIFIED_LINE_BG),
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
      editor.setDecorations(this.addedType, []);
      editor.setDecorations(this.modifiedType, []);
      editor.setDecorations(this.deletionType, []);
      return;
    }
    const hoverMessage = new this.vscode.MarkdownString(`[Open Diff vs Base](command:${CMD_OPEN_DIFF})`);
    hoverMessage.isTrusted = true;
    const addedRanges: VscodeLike[] = [];
    const modifiedRanges: VscodeLike[] = [];
    for (const range of file.ranges) {
      const vsRange = new this.vscode.Range(range.start, 0, Math.max(range.end - 1, range.start), Number.MAX_SAFE_INTEGER);
      const options = { range: vsRange, hoverMessage };
      if (file.kind === 'added' || file.kind === 'untracked') {
        addedRanges.push(options);
      } else {
        modifiedRanges.push(options);
      }
    }
    editor.setDecorations(this.addedType, addedRanges);
    editor.setDecorations(this.modifiedType, modifiedRanges);
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

  dispose(): void {
    this.addedType.dispose();
    this.modifiedType.dispose();
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
