import { describe, expect, it } from 'vitest';
import { lineCountOf, unchangedLineRanges } from '../../src/domain/unchangedLines';

describe('unchangedLineRanges', () => {
  it('dulls the head and tail around a change', () => {
    const dull = unchangedLineRanges(30, [{ start: 10, end: 12 }], []);
    expect(dull).toEqual([
      { start: 0, end: 10 },
      { start: 12, end: 30 }
    ]);
    expect(lineCountOf(dull)).toBe(28);
  });

  it('keeps a deletion anchor bright', () => {
    const dull = unchangedLineRanges(20, [], [8]);
    expect(dull).toEqual([
      { start: 0, end: 8 },
      { start: 9, end: 20 }
    ]);
  });

  it('does not dull the gap inside a merged change', () => {
    const dull = unchangedLineRanges(20, [{ start: 4, end: 8 }, { start: 6, end: 10 }], []);
    expect(dull).toEqual([
      { start: 0, end: 4 },
      { start: 10, end: 20 }
    ]);
  });

  it('dulls the unmodified lines between two changes', () => {
    const dull = unchangedLineRanges(20, [{ start: 2, end: 4 }, { start: 10, end: 12 }], []);
    expect(dull).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 10 },
      { start: 12, end: 20 }
    ]);
  });

  it('returns nothing when the whole file changed', () => {
    expect(unchangedLineRanges(5, [{ start: 0, end: 5 }], [])).toEqual([]);
  });

  it('returns nothing when no change can be placed', () => {
    expect(unchangedLineRanges(40, [], [])).toEqual([]);
  });

  it('clamps ranges that run past the document', () => {
    expect(unchangedLineRanges(8, [{ start: 6, end: 40 }], [])).toEqual([{ start: 0, end: 6 }]);
  });
});
