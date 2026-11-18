import { describe, expect, it } from 'vitest';
import { changeLinesOf, findAdjacentChangeLine } from '../../src/domain/changeNavigation';

describe('changeNavigation', () => {
  it('collects change lines from ranges and deletion anchors without duplicates', () => {
    expect(changeLinesOf([{ start: 7 }, { start: 2 }, { start: 7 }], [7, 4])).toEqual([2, 4, 7]);
  });

  it('finds the next change after the cursor', () => {
    expect(findAdjacentChangeLine([2, 7], 0, 'next')).toEqual({ line: 2, wrapped: false });
    expect(findAdjacentChangeLine([2, 7], 2, 'next')).toEqual({ line: 7, wrapped: false });
  });

  it('wraps next around to the first change', () => {
    expect(findAdjacentChangeLine([2, 7], 7, 'next')).toEqual({ line: 2, wrapped: true });
    expect(findAdjacentChangeLine([2, 7], 99, 'next')).toEqual({ line: 2, wrapped: true });
  });

  it('finds the previous change before the cursor', () => {
    expect(findAdjacentChangeLine([2, 7], 9, 'previous')).toEqual({ line: 7, wrapped: false });
    expect(findAdjacentChangeLine([2, 7], 7, 'previous')).toEqual({ line: 2, wrapped: false });
  });

  it('wraps previous around to the last change', () => {
    expect(findAdjacentChangeLine([2, 7], 2, 'previous')).toEqual({ line: 7, wrapped: true });
    expect(findAdjacentChangeLine([2, 7], 0, 'previous')).toEqual({ line: 7, wrapped: true });
  });

  it('returns null when there are no changes', () => {
    expect(findAdjacentChangeLine([], 0, 'next')).toBeNull();
    expect(findAdjacentChangeLine([], 0, 'previous')).toBeNull();
  });

  it('handles a single change line', () => {
    expect(findAdjacentChangeLine([5], 0, 'next')).toEqual({ line: 5, wrapped: false });
    expect(findAdjacentChangeLine([5], 5, 'next')).toEqual({ line: 5, wrapped: true });
    expect(findAdjacentChangeLine([5], 9, 'previous')).toEqual({ line: 5, wrapped: false });
    expect(findAdjacentChangeLine([5], 5, 'previous')).toEqual({ line: 5, wrapped: true });
  });
});
