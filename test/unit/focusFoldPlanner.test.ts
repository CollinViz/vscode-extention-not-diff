import { describe, expect, it } from 'vitest';
import { planFocusFolds } from '../../src/domain/focusFoldPlanner';
import { DEFAULT_FOCUS_CONTEXT_LINES, MIN_FOCUS_UNCHANGED_LINES } from '../../src/config/constants';

const CONTEXT = DEFAULT_FOCUS_CONTEXT_LINES;
const MIN_GAP = MIN_FOCUS_UNCHANGED_LINES;

function lines(from: number, to: number) {
  return [{ start: from, end: to }];
}

function range(fromInclusive: number, toExclusive: number): number[] {
  const out: number[] = [];
  for (let line = fromInclusive; line < toExclusive; line += 1) {
    out.push(line);
  }
  return out;
}

describe('focusFoldPlanner', () => {
  it('folds the head and tail of a file around one change', () => {
    const regions = planFocusFolds({ highlights: lines(10, 12), deletionAnchors: [], lineCount: 30, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([
      { start: 0, end: 6, hiddenCount: 6 },
      { start: 14, end: 29, hiddenCount: 15 }
    ]);
  });

  it('keeps the configured context lines around the change visible', () => {
    // Change at lines 10..12 with 3 context lines: visible window is 7..14,
    // and no fold region may hide a line inside that window.
    const regions = planFocusFolds({ highlights: lines(10, 12), deletionAnchors: [], lineCount: 30, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    const hiddenLines = regions.flatMap((region) => range(region.start + 1, region.end + 1));
    for (const line of hiddenLines) {
      expect(line < 7 || line >= 15, `hidden line ${line} inside the context window`).toBe(true);
    }
  });

  it('merges nearby changes into one visible window', () => {
    const regions = planFocusFolds({
      highlights: [...lines(10, 12), ...lines(14, 16)],
      deletionAnchors: [],
      lineCount: 40,
      contextLines: CONTEXT,
      minUnchangedLines: MIN_GAP
    });
    // The one-line gap between the two changes is smaller than the context
    // padding, so only head and tail folds exist.
    expect(regions).toEqual([
      { start: 0, end: 6, hiddenCount: 6 },
      { start: 18, end: 39, hiddenCount: 21 }
    ]);
  });

  it('folds the gap between two far-apart changes', () => {
    const regions = planFocusFolds({
      highlights: [...lines(5, 6), ...lines(25, 26)],
      deletionAnchors: [],
      lineCount: 40,
      contextLines: CONTEXT,
      minUnchangedLines: MIN_GAP
    });
    const middle = regions.filter((region) => region.start >= 6 && region.end <= 25);
    expect(middle).toEqual([{ start: 8, end: 21, hiddenCount: 13 }]);
  });

  it('creates a visible window around deletion anchors', () => {
    const regions = planFocusFolds({ highlights: [], deletionAnchors: [15], lineCount: 40, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([
      { start: 0, end: 11, hiddenCount: 11 },
      { start: 18, end: 39, hiddenCount: 21 }
    ]);
  });

  it('skips gaps smaller than the minimum', () => {
    // A change right after the head leaves a 2-line tail gap below the minimum.
    const regions = planFocusFolds({ highlights: lines(0, 28), deletionAnchors: [], lineCount: 30, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([]);
  });

  it('handles a change at the very start of the file', () => {
    const regions = planFocusFolds({ highlights: lines(0, 2), deletionAnchors: [], lineCount: 20, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([{ start: 4, end: 19, hiddenCount: 15 }]);
  });

  it('handles a change at the very end of the file', () => {
    const regions = planFocusFolds({ highlights: lines(17, 20), deletionAnchors: [], lineCount: 20, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([{ start: 0, end: 13, hiddenCount: 13 }]);
  });

  it('returns nothing for a fully changed file', () => {
    const regions = planFocusFolds({ highlights: lines(0, 20), deletionAnchors: [], lineCount: 20, contextLines: CONTEXT, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([]);
  });

  it('supports zero context lines', () => {
    const regions = planFocusFolds({ highlights: lines(10, 11), deletionAnchors: [], lineCount: 20, contextLines: 0, minUnchangedLines: MIN_GAP });
    expect(regions).toEqual([
      { start: 0, end: 9, hiddenCount: 9 },
      { start: 10, end: 19, hiddenCount: 9 }
    ]);
  });
});
