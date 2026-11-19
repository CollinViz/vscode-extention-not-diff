import type { LineRange } from './models';

/**
 * Lines that should be dulled when "dim unchanged" is on: every line that is
 * not part of a highlight range and not a deletion anchor. Returns nothing
 * when there is no located change, so a file we cannot place a change in is
 * never dimmed end to end.
 */
export function unchangedLineRanges(
  lineCount: number,
  highlights: readonly LineRange[],
  deletionAnchors: readonly number[]
): readonly LineRange[] {
  if (lineCount <= 0) {
    return [];
  }
  const bright = mergedBright(lineCount, highlights, deletionAnchors);
  if (bright.length === 0) {
    return [];
  }
  const dull: LineRange[] = [];
  let cursor = 0;
  for (const interval of bright) {
    if (interval.start > cursor) {
      dull.push({ start: cursor, end: interval.start });
    }
    cursor = interval.end;
  }
  if (cursor < lineCount) {
    dull.push({ start: cursor, end: lineCount });
  }
  return dull;
}

export function lineCountOf(ranges: readonly LineRange[]): number {
  let total = 0;
  for (const range of ranges) {
    total += Math.max(range.end - range.start, 0);
  }
  return total;
}

function mergedBright(
  lineCount: number,
  highlights: readonly LineRange[],
  deletionAnchors: readonly number[]
): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = [];
  for (const range of highlights) {
    const start = clampLine(range.start, lineCount);
    const end = clampLine(range.end, lineCount);
    if (end > start) {
      intervals.push({ start, end });
    }
  }
  for (const anchor of deletionAnchors) {
    const start = clampLine(anchor, lineCount);
    const end = clampLine(anchor + 1, lineCount);
    if (end > start) {
      intervals.push({ start, end });
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, interval.end) };
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function clampLine(line: number, lineCount: number): number {
  if (line < 0) {
    return 0;
  }
  if (line > lineCount) {
    return lineCount;
  }
  return line;
}
