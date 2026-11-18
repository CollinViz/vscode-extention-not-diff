import { EMPTY_COUNT, FIRST_INDEX, IMPLICIT_HUNK_COUNT, ONE_BASED_TO_ZERO_BASED_OFFSET } from '../config/constants';
import type { DiffHunk, LineRange } from './models';

const HUNK_HEADER_PATTERN = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diffText: string): readonly DiffHunk[] {
  if (diffText.length === EMPTY_COUNT) {
    return [];
  }
  const lines = diffText.split('\n');
  for (const line of lines) {
    if (line.startsWith('Binary files') || line.includes('GIT binary patch')) {
      return [];
    }
  }
  const hunks: DiffHunk[] = [];
  for (const line of lines) {
    const match = HUNK_HEADER_PATTERN.exec(line);
    if (!match) {
      continue;
    }
    const oldStartRaw = Number(match[1]);
    const newStartRaw = Number(match[3]);
    const oldCount = match[2] === undefined ? IMPLICIT_HUNK_COUNT : Number(match[2]);
    const newCount = match[4] === undefined ? IMPLICIT_HUNK_COUNT : Number(match[4]);
    const oldStart = oldStartRaw > EMPTY_COUNT ? oldStartRaw - ONE_BASED_TO_ZERO_BASED_OFFSET : EMPTY_COUNT;
    const newStart = newStartRaw > EMPTY_COUNT ? newStartRaw - ONE_BASED_TO_ZERO_BASED_OFFSET : EMPTY_COUNT;
    if (oldCount === EMPTY_COUNT && newCount > EMPTY_COUNT) {
      hunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        kind: 'add',
        highlight: { start: newStart, end: newStart + newCount },
        deletionAnchor: null
      });
    } else if (newCount === EMPTY_COUNT && oldCount > EMPTY_COUNT) {
      // Anchor pure deletions at the new-side position git reports (the line the deletion attaches to).
      const anchor = Math.max(newStart, FIRST_INDEX);
      hunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        kind: 'delete',
        highlight: null,
        deletionAnchor: anchor
      });
    } else {
      hunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        kind: 'modify',
        highlight: { start: newStart, end: newStart + newCount },
        deletionAnchor: null
      });
    }
  }
  return hunks;
}

export function highlightRanges(hunks: readonly DiffHunk[]): readonly LineRange[] {
  return hunks.flatMap((hunk) => (hunk.highlight === null ? [] : [hunk.highlight]));
}
