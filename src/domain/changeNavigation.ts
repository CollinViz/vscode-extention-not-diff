export type ChangeDirection = 'next' | 'previous';

export interface AdjacentChange {
  readonly line: number;
  readonly wrapped: boolean;
}

export function changeLinesOf(ranges: readonly { readonly start: number }[], deletionAnchors: readonly number[]): readonly number[] {
  const lines = new Set<number>();
  for (const range of ranges) {
    lines.add(range.start);
  }
  for (const anchor of deletionAnchors) {
    lines.add(anchor);
  }
  return [...lines].sort((a, b) => a - b);
}

export function findAdjacentChangeLine(
  changeLines: readonly number[],
  cursorLine: number,
  direction: ChangeDirection
): AdjacentChange | null {
  if (changeLines.length === 0) {
    return null;
  }
  if (direction === 'next') {
    for (const line of changeLines) {
      if (line > cursorLine) {
        return { line, wrapped: false };
      }
    }
    const first = changeLines[0];
    if (first === undefined) {
      return null;
    }
    return { line: first, wrapped: true };
  }
  for (let index = changeLines.length - 1; index >= 0; index -= 1) {
    const line = changeLines[index];
    if (line !== undefined && line < cursorLine) {
      return { line, wrapped: false };
    }
  }
  const last = changeLines[changeLines.length - 1];
  if (last === undefined) {
    return null;
  }
  return { line: last, wrapped: true };
}
