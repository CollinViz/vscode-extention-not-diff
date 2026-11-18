export function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function basenamePosix(value: string): string {
  const posix = toPosixPath(value);
  const index = posix.lastIndexOf('/');
  return index === -1 ? posix : posix.slice(index + 1);
}

export function dirnamePosix(value: string): string {
  const posix = toPosixPath(value);
  const index = posix.lastIndexOf('/');
  if (index === -1) {
    return '.';
  }
  if (index === 0) {
    return '/';
  }
  return posix.slice(0, index);
}

export function joinPosix(...segments: readonly string[]): string {
  return segments.map(toPosixPath).join('/').replace(/\/{2,}/g, '/');
}

export function relativePosix(root: string, absolute: string): string {
  const rootPosix = toPosixPath(root).replace(/\/$/, '');
  const absPosix = toPosixPath(absolute);
  if (absPosix === rootPosix) {
    return '.';
  }
  if (absPosix.startsWith(`${rootPosix}/`)) {
    return absPosix.slice(rootPosix.length + 1);
  }
  return absPosix;
}

export function absoluteFromRoot(root: string, relative: string): string {
  const rootPosix = toPosixPath(root).replace(/\/$/, '');
  const relPosix = toPosixPath(relative).replace(/^\//, '');
  return `${rootPosix}/${relPosix}`;
}
