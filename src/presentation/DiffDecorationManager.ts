import { join } from 'node:path';
import { CFG_UNCHANGED_LINE_OPACITY, CMD_OPEN_DIFF, COLOR_CHANGED_LINE_BG } from '../config/identifiers';
import { CHANGE_BAR_COLOR, DEFAULT_UNCHANGED_LINE_OPACITY, ICON_GUTTER_CHANGED, OPACITY_FRACTION_DIGITS } from '../config/constants';
import { changeLinesOf, findAdjacentChangeLine, type ChangeDirection } from '../domain/changeNavigation';
import { lineCountOf, unchangedLineRanges } from '../domain/unchangedLines';
import type { ChangedFile } from '../domain/models';
import { absoluteFromRoot, toPosixPath } from '../util/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

const OPACITY_IMPORTANT = ' !important';

export class DiffDecorationManager {
  private readonly changedType: VscodeLike;
  private readonly deletionType: VscodeLike;
  private fadeType: VscodeLike | null = null;
  private dimUnchanged = false;
  private files: readonly ChangedFile[] = [];
  private readonly lastDimmed = new Map<string, number>();

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

  isDimUnchanged(): boolean {
    return this.dimUnchanged;
  }

  /** Session toggle. Unchanged lines stay in place; only their opacity changes. */
  setDimUnchanged(enabled: boolean): void {
    this.dimUnchanged = enabled;
    if (!enabled) {
      this.lastDimmed.clear();
    }
  }

  /** Drop the fade decoration type so the next refresh picks up a new opacity. */
  reloadDimDecoration(): void {
    if (this.fadeType) {
      this.fadeType.dispose();
      this.fadeType = null;
    }
  }

  dimmedLineCountFor(fsPath: string): number {
    return this.lastDimmed.get(toPosixPath(fsPath)) ?? 0;
  }

  refreshForEditor(editor: VscodeLike | undefined): void {
    if (!editor) {
      return;
    }
    const file = this.findFile(editor.document.uri.fsPath);
    if (!file) {
      editor.setDecorations(this.changedType, []);
      editor.setDecorations(this.deletionType, []);
      this.clearFade(editor);
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
    this.applyFade(editor, file);
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
    this.changedType.dispose();
    this.deletionType.dispose();
    this.fadeType?.dispose();
  }

  private applyFade(editor: VscodeLike, file: ChangedFile): void {
    const key = toPosixPath(editor.document.uri.fsPath);
    if (!this.dimUnchanged) {
      this.lastDimmed.delete(key);
      this.clearFade(editor);
      return;
    }
    const dull = unchangedLineRanges(editor.document.lineCount, file.ranges, file.deletionAnchors);
    this.lastDimmed.set(key, lineCountOf(dull));
    const options = dull.map((range) => ({
      range: new this.vscode.Range(range.start, 0, Math.max(range.end - 1, range.start), Number.MAX_SAFE_INTEGER)
    }));
    editor.setDecorations(this.ensureFadeType(), options);
  }

  private clearFade(editor: VscodeLike): void {
    if (this.fadeType) {
      editor.setDecorations(this.fadeType, []);
    }
  }

  private ensureFadeType(): VscodeLike {
    if (this.fadeType) {
      return this.fadeType;
    }
    const configured = this.vscode.workspace.getConfiguration().get(CFG_UNCHANGED_LINE_OPACITY, DEFAULT_UNCHANGED_LINE_OPACITY);
    const opacity = typeof configured === 'number' && configured > 0 && configured < 1 ? configured : DEFAULT_UNCHANGED_LINE_OPACITY;
    // `!important` is what GitLens uses: theme CSS otherwise wins over decoration opacity.
    this.fadeType = this.vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      opacity: `${opacity.toFixed(OPACITY_FRACTION_DIGITS)}${OPACITY_IMPORTANT}`
    });
    return this.fadeType;
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
