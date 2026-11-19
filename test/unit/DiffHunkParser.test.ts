import { describe, expect, it } from 'vitest';
import { countDiffChanges, deletionAnchorsOf, highlightRanges, parseUnifiedDiff } from '../../src/domain/DiffHunkParser';

describe('DiffHunkParser', () => {
  it('parses a single-line addition', () => {
    const hunks = parseUnifiedDiff('@@ -10,0 +11 @@\n+line\n');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.highlight).toEqual({ start: 10, end: 11 });
    expect(highlightRanges(hunks)).toEqual([{ start: 10, end: 11 }]);
  });

  it('parses a multi-line addition', () => {
    const hunks = parseUnifiedDiff('@@ -0,0 +1,3 @@\n+a\n+b\n+c\n');
    expect(hunks[0]?.highlight).toEqual({ start: 0, end: 3 });
  });

  it('parses a modification', () => {
    const hunks = parseUnifiedDiff('@@ -4,2 +4,2 @@\n-old\n+new\n');
    expect(hunks[0]?.kind).toBe('modify');
    expect(hunks[0]?.highlight).toEqual({ start: 3, end: 5 });
  });

  it('handles pure deletions without throwing', () => {
    const hunks = parseUnifiedDiff('@@ -8,2 +7,0 @@\n-gone\n');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.highlight).toBeNull();
    expect(typeof hunks[0]?.deletionAnchor).toBe('number');
    expect(highlightRanges(hunks)).toEqual([]);
  });

  it('parses multiple hunks', () => {
    const hunks = parseUnifiedDiff('@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,0 +11,2 @@\n+x\n+y\n');
    expect(hunks).toHaveLength(2);
  });

  it('returns empty for empty and header-only diffs', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('diff --git a/foo b/foo\nindex 123..456 100644\n')).toEqual([]);
  });

  it('returns empty for binary diffs', () => {
    expect(parseUnifiedDiff('Binary files a/foo and b/foo differ\n')).toEqual([]);
    expect(parseUnifiedDiff('GIT binary patch\n')).toEqual([]);
  });

  it('treats omitted counts as one', () => {
    const hunks = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n');
    expect(hunks[0]?.oldCount).toBe(1);
    expect(hunks[0]?.newCount).toBe(1);
    expect(hunks[0]?.highlight).toEqual({ start: 0, end: 1 });
  });

  it('converts 1-based starts to zero-based', () => {
    const hunks = parseUnifiedDiff('@@ -5,1 +5,1 @@\n-a\n+b\n');
    expect(hunks[0]?.highlight?.start).toBe(4);
  });

  it('sums per-file +/− counts across hunks', () => {
    const hunks = parseUnifiedDiff('@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,0 +11,2 @@\n+x\n+y\n@@ -20,3 +22,0 @@\n-gone1\n-gone2\n-gone3\n');
    expect(countDiffChanges(hunks)).toEqual({ additions: 3, deletions: 4 });
  });

  it('counts an implicit-count hunk as one line each side', () => {
    const hunks = parseUnifiedDiff('@@ -1 +1 @@\n-a\n+b\n');
    expect(countDiffChanges(hunks)).toEqual({ additions: 1, deletions: 1 });
  });

  it('counts empty diffs as zero', () => {
    expect(countDiffChanges(parseUnifiedDiff(''))).toEqual({ additions: 0, deletions: 0 });
    expect(countDiffChanges(parseUnifiedDiff('Binary files a/foo and b/foo differ\n'))).toEqual({ additions: 0, deletions: 0 });
  });

  it('collects deletion anchors in file order', () => {
    const hunks = parseUnifiedDiff('@@ -8,2 +7,0 @@\n-gone\n@@ -20,1 +20,1 @@\n-old\n+new\n');
    expect(deletionAnchorsOf(hunks)).toHaveLength(1);
    expect(deletionAnchorsOf(hunks)[0]).toBe(hunks[0]?.deletionAnchor);
  });
});
