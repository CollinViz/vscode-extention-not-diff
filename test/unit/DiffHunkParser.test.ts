import { describe, expect, it } from 'vitest';
import { highlightRanges, parseUnifiedDiff } from '../../src/domain/DiffHunkParser';

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
});
