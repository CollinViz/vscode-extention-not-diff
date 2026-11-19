import {
  DEFAULT_FOCUS_CONTEXT_LINES,
  FOLD_APPLY_DELAY_MS,
  MIN_FOCUS_UNCHANGED_LINES
} from '../config/constants';
import { CFG_FOCUS_CONTEXT_LINES, CTX_FOCUS_MODE } from '../config/identifiers';
import { planFocusFolds, type FocusFoldRegion } from '../domain/focusFoldPlanner';
import { toPosixPath } from '../util/paths';
import type { DiffDecorationManager } from './DiffDecorationManager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

const FOCUS_HINT_ELLIPSIS = '⋯';
const FOCUS_HINT_UNIT = 'unmodified lines';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "Laser focus" mode: fold every unmodified line that is not within
 * `contextLines` of a change, so only the changes stay visible. Fold
 * regions come from a FoldingRangeProvider scoped to the reviewed repos
 * (registered only while focus mode is on, because a provider's presence
 * disables indentation-based folding for the documents it matches); the
 * regions are collapsed programmatically with `editor.fold`. A gray
 * after-text decoration on the chevron line says how many unmodified
 * lines are hidden, mirroring the diff editor's unchanged-region bar.
 */
export class FocusModeController {
  private readonly hintType: VscodeLike;
  private readonly foldingRangesChanged: VscodeLike;
  private readonly appliedDocs = new Set<string>();
  private readonly lastPlans = new Map<string, readonly FocusFoldRegion[]>();
  private providerDisposable: VscodeLike | null = null;
  private enabled = false;

  constructor(
    private readonly vscode: VscodeLike,
    private readonly decorations: DiffDecorationManager
  ) {
    this.hintType = vscode.window.createTextEditorDecorationType({
      after: { color: new vscode.ThemeColor('editorGhostText.foreground') }
    });
    this.foldingRangesChanged = new vscode.EventEmitter();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  contextLines(): number {
    const configuration = this.vscode.workspace.getConfiguration();
    return configuration.get(CFG_FOCUS_CONTEXT_LINES, DEFAULT_FOCUS_CONTEXT_LINES);
  }

  /** Number of fold regions planned for a document (0 when focus never applied). */
  foldCountFor(fsPath: string): number {
    return this.lastPlans.get(toPosixPath(fsPath))?.length ?? 0;
  }

  async toggle(): Promise<void> {
    if (this.enabled) {
      await this.disable();
    } else {
      await this.enable();
    }
  }

  async enable(): Promise<void> {
    this.enabled = true;
    await this.setContext();
    this.registerProvider();
    const editor = this.vscode.window.activeTextEditor;
    if (editor) {
      await this.applyToEditor(editor);
    }
  }

  async disable(): Promise<void> {
    this.enabled = false;
    await this.setContext();
    if (this.providerDisposable) {
      this.providerDisposable.dispose();
      this.providerDisposable = null;
    }
    this.foldingRangesChanged.fire(undefined);
    const editor = this.vscode.window.activeTextEditor;
    if (editor) {
      await this.undoForEditor(editor);
    }
  }

  /** Snapshot changed: open editors should re-query the folding provider. */
  onSnapshot(): void {
    if (this.enabled) {
      this.foldingRangesChanged.fire(undefined);
    }
  }

  /** Focus is a session posture: newly opened review files get focused too. */
  async onActiveEditorChanged(editor: VscodeLike | undefined): Promise<void> {
    if (!editor) {
      return;
    }
    if (this.enabled) {
      await this.applyToEditor(editor);
      return;
    }
    if (this.appliedDocs.has(this.docKey(editor))) {
      await this.undoForEditor(editor);
    }
  }

  async applyToEditor(editor: VscodeLike): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const key = this.docKey(editor);
    const file = this.decorations.fileFor(key);
    if (!file) {
      return;
    }
    const plan = planFocusFolds({
      highlights: file.ranges,
      deletionAnchors: file.deletionAnchors,
      lineCount: editor.document.lineCount,
      contextLines: this.contextLines(),
      minUnchangedLines: MIN_FOCUS_UNCHANGED_LINES
    });
    this.lastPlans.set(key, plan);
    this.setHintDecorations(editor, plan);
    if (this.appliedDocs.has(key) || plan.length === 0) {
      return;
    }
    this.appliedDocs.add(key);
    // Let the editor pick up the provider's ranges before folding.
    await wait(FOLD_APPLY_DELAY_MS);
    await this.vscode.commands.executeCommand('editor.fold', { selectionLines: plan.map((region) => region.start) });
    // Guarantee the changed lines themselves are visible even if a fold
    // command grabbed a bigger (language) region sharing the start line.
    await this.vscode.commands.executeCommand('editor.unfold', { selectionLines: changedStartLines(file.ranges, file.deletionAnchors) });
  }

  async undoForEditor(editor: VscodeLike): Promise<void> {
    const key = this.docKey(editor);
    this.lastPlans.delete(key);
    editor.setDecorations(this.hintType, []);
    if (!this.appliedDocs.delete(key)) {
      return;
    }
    await this.vscode.commands.executeCommand('editor.unfoldAll');
  }

  dispose(): void {
    this.providerDisposable?.dispose();
    this.hintType.dispose();
  }

  private docKey(editor: VscodeLike): string {
    return toPosixPath(editor.document.uri.fsPath);
  }

  private async setContext(): Promise<void> {
    await this.vscode.commands.executeCommand('setContext', CTX_FOCUS_MODE, this.enabled);
  }

  private setHintDecorations(editor: VscodeLike, plan: readonly FocusFoldRegion[]): void {
    const options = plan.map((region) => ({
      range: new this.vscode.Range(region.start, 0, region.start, Number.MAX_SAFE_INTEGER),
      renderOptions: {
        after: {
          contentText: `  ${FOCUS_HINT_ELLIPSIS} ${region.hiddenCount} ${FOCUS_HINT_UNIT}`
        }
      }
    }));
    editor.setDecorations(this.hintType, options);
  }

  /**
   * The provider's presence changes folding behavior for everything it
   * matches, so it only exists while focus mode is on, and it only matches
   * the repositories currently under review.
   */
  private registerProvider(): void {
    const repoRoots = new Set<string>();
    for (const file of this.decorations.snapshotFiles()) {
      repoRoots.add(file.repo.rootPath);
    }
    const selector = [...repoRoots].map((root) => ({
      scheme: 'file',
      pattern: new this.vscode.RelativePattern(this.vscode.Uri.file(root), '**/*')
    }));
    const provider = {
      onDidChangeFoldingRanges: this.foldingRangesChanged.event,
      provideFoldingRanges: (document: VscodeLike): VscodeLike[] => this.provideFoldingRanges(document)
    };
    this.providerDisposable = this.vscode.languages.registerFoldingRangeProvider(selector, provider);
  }

  private provideFoldingRanges(document: VscodeLike): VscodeLike[] {
    if (!this.enabled) {
      return [];
    }
    const file = this.decorations.fileFor(toPosixPath(document.uri.fsPath));
    if (!file) {
      return [];
    }
    const plan = planFocusFolds({
      highlights: file.ranges,
      deletionAnchors: file.deletionAnchors,
      lineCount: document.lineCount,
      contextLines: this.contextLines(),
      minUnchangedLines: MIN_FOCUS_UNCHANGED_LINES
    });
    this.lastPlans.set(toPosixPath(document.uri.fsPath), plan);
    return plan.map((region) => new this.vscode.FoldingRange(region.start, region.end));
  }
}

function changedStartLines(ranges: readonly { start: number }[], anchors: readonly number[]): number[] {
  const lines = new Set<number>();
  for (const range of ranges) {
    lines.add(range.start);
  }
  for (const anchor of anchors) {
    lines.add(anchor);
  }
  return [...lines];
}
