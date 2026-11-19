import type { LineRange } from './models';

/**
 * One fold region of a "laser focus" view: the unchanged lines between
 * changes are hidden by folding, keeping the changed lines plus
 * `contextLines` unmodified lines above and below visible.
 *
 * `start` is the 0-based line that stays visible and carries the fold
 * chevron (VS Code always keeps the first line of a fold region visible);
 * `end` is the 0-based last line hidden when the region is collapsed.
 */
export interface FocusFoldRegion {
  readonly start: number;
  readonly end: number;
  readonly hiddenCount: number;
}

export interface FocusFoldInput {
  readonly highlights: readonly LineRange[];
  readonly deletionAnchors: readonly number[];
  readonly lineCount: number;
  readonly contextLines: number;
  readonly minUnchangedLines: number;
}

/**
 * Computes the fold regions that hide everything except the changed lines
 * (highlight ranges and deletion anchors) padded with `contextLines` of
 * unmodified context on each side. Head and tail of the file are folded
 * like any other unchanged gap.
 */
export function planFocusFolds(input: FocusFoldInput): readonly FocusFoldRegion[] {
  const visible = mergedVisibleIntervals(input);
  const regions: FocusFoldRegion[] = [];
  let previousEnd = 0;
  for (const interval of visible) {
    pushGapFold(regions, previousEnd, interval.start, input.minUnchangedLines);
    previousEnd = interval.end;
  }
  pushGapFold(regions, previousEnd, input.lineCount, input.minUnchangedLines);
  return regions;
}

function mergedVisibleIntervals(input: FocusFoldInput): readonly { start: number; end: number }[] {
  const padded: { start: number; end: number }[] = [];
  for (const range of input.highlights) {
    padded.push(padInterval(range.start, range.end, input.lineCount, input.contextLines));
  }
  for (const anchor of input.deletionAnchors) {
    padded.push(padInterval(anchor, anchor + 1, input.lineCount, input.contextLines));
  }
  padded.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const interval of padded) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, interval.end) };
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function padInterval(start: number, end: number, lineCount: number, contextLines: number): { start: number; end: number } {
  const clampedStart = Math.max(start - contextLines, 0);
  const clampedEnd = Math.min(end + contextLines, lineCount);
  return { start: clampedStart, end: Math.max(clampedEnd, clampedStart) };
}

/**
 * A gap `[gapStart, gapEnd)` of unchanged lines becomes one fold region.
 * The chevron line is the last visible line before the gap (`gapStart - 1`);
 * only when the gap starts at the top of the file does the first unchanged
 * line itself stay visible, because a fold region always keeps its first
 * line on screen.
 */
function pushGapFold(regions: FocusFoldRegion[], gapStart: number, gapEnd: number, minUnchangedLines: number): void {
  const unchanged = gapEnd - gapStart;
  if (unchanged < minUnchangedLines) {
    return;
  }
  const start = gapStart > 0 ? gapStart - 1 : 0;
  const end = gapEnd - 1;
  const hiddenCount = end - start;
  if (hiddenCount < 1) {
    return;
  }
  regions.push({ start, end, hiddenCount });
}
