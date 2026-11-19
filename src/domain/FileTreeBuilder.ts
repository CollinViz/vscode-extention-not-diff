import type { ChangedFile, FileTreeNode, ViewMode } from './models';
import { toPosixPath } from '../util/paths';
import { EMPTY_COUNT } from '../config/constants';

export function changedFileKey(repoId: string, relativePath: string): string {
  return `${repoId}::${toPosixPath(relativePath)}`;
}

const LOCALE_COMPARE_OPTIONS: Intl.CollatorOptions = { sensitivity: 'base' };

export function compareFiles(a: ChangedFile, b: ChangedFile): number {
  if (a.repo.name !== b.repo.name) {
    return a.repo.name.localeCompare(b.repo.name, undefined, LOCALE_COMPARE_OPTIONS);
  }
  return toPosixPath(a.relativePath).localeCompare(toPosixPath(b.relativePath), undefined, LOCALE_COMPARE_OPTIONS);
}

function nodeLabelSort(a: FileTreeNode, b: FileTreeNode): number {
  const aIsDir = a.kind !== 'file' ? 0 : 1;
  const bIsDir = b.kind !== 'file' ? 0 : 1;
  if (aIsDir !== bIsDir) {
    return aIsDir - bIsDir;
  }
  return a.label.localeCompare(b.label, undefined, LOCALE_COMPARE_OPTIONS);
}

function repoGroupSort(a: FileTreeNode, b: FileTreeNode): number {
  return a.label.localeCompare(b.label, undefined, LOCALE_COMPARE_OPTIONS);
}

export function buildTree(
  files: readonly ChangedFile[],
  mode: ViewMode,
  reviewedKeys: ReadonlySet<string> = new Set<string>()
): readonly FileTreeNode[] {
  const sorted = [...files].sort(compareFiles);
  if (mode === 'flat') {
    return sorted.map((file) =>
      ({
        id: changedFileKey(file.repo.id, file.relativePath),
        label: toPosixPath(file.relativePath),
        description: file.repo.name,
        repoId: file.repo.id,
        relativePath: toPosixPath(file.relativePath),
        kind: 'file',
        changeKind: file.kind,
        collapsible: false,
        children: [],
        baseCommit: file.baseCommit,
        previousPath: file.previousPath,
        additions: file.additions,
        deletions: file.deletions,
        reviewed: reviewedKeys.has(changedFileKey(file.repo.id, file.relativePath))
      }) satisfies FileTreeNode
    );
  }
  const byRepo = new Map<string, ChangedFile[]>();
  for (const file of sorted) {
    const group = byRepo.get(file.repo.id);
    if (group) {
      group.push(file);
    } else {
      byRepo.set(file.repo.id, [file]);
    }
  }
  const repoIds = [...byRepo.keys()];
  const singleRepo = repoIds.length === 1;
  const roots: FileTreeNode[] = [];
  const orderedRepoIds = repoIds.sort((a, b) => {
    const nameA = byRepo.get(a)?.[0]?.repo.name ?? a;
    const nameB = byRepo.get(b)?.[0]?.repo.name ?? b;
    return nameA.localeCompare(nameB, undefined, LOCALE_COMPARE_OPTIONS);
  });
  for (const repoId of orderedRepoIds) {
    const repoFiles = byRepo.get(repoId) ?? [];
    const repoName = repoFiles[0]?.repo.name ?? repoId;
    const children = buildRepoTree(repoId, repoName, repoFiles, reviewedKeys);
    if (singleRepo) {
      roots.push(...children);
    } else {
      const repoNode: FileTreeNode = {
        id: `repo::${repoId}`,
        label: repoName,
        description: '',
        repoId,
        relativePath: null,
        kind: 'repo',
        changeKind: null,
        collapsible: true,
        children,
        baseCommit: null,
        previousPath: null,
        additions: EMPTY_COUNT,
        deletions: EMPTY_COUNT,
        reviewed: false
      };
      roots.push(repoNode);
    }
  }
  if (singleRepo) {
    return [...roots].sort(nodeLabelSort);
  }
  return [...roots].sort(repoGroupSort);
}

interface MutableDir {
  label: string;
  fullPath: string;
  dirs: Map<string, MutableDir>;
  files: FileTreeNode[];
}

function buildRepoTree(repoId: string, repoName: string, files: readonly ChangedFile[], reviewedKeys: ReadonlySet<string>): FileTreeNode[] {
  const root: MutableDir = { label: '', fullPath: '', dirs: new Map(), files: [] };
  for (const file of files) {
    const posix = toPosixPath(file.relativePath);
    const segments = posix.split('/');
    let current = root;
    let prefix = '';
    for (let i = 0; i < segments.length - 1; i += 1) {
      const segment = segments[i] ?? '';
      prefix = prefix === '' ? segment : `${prefix}/${segment}`;
      let next = current.dirs.get(segment);
      if (!next) {
        next = { label: segment, fullPath: prefix, dirs: new Map(), files: [] };
        current.dirs.set(segment, next);
      }
      current = next;
    }
    const fileName = segments[segments.length - 1] ?? posix;
    current.files.push({
      id: changedFileKey(repoId, posix),
      label: fileName,
      description: repoName,
      repoId,
      relativePath: posix,
      kind: 'file',
      changeKind: file.kind,
      collapsible: false,
      children: [],
      baseCommit: file.baseCommit,
      previousPath: file.previousPath,
      additions: file.additions,
      deletions: file.deletions,
      reviewed: reviewedKeys.has(changedFileKey(repoId, posix))
    });
  }
  return materializeDirs(root, repoId);
}

function materializeDirs(dir: MutableDir, repoId: string): FileTreeNode[] {
  const results: FileTreeNode[] = [];
  for (const child of dir.dirs.values()) {
    results.push(compactDir(child, repoId));
  }
  for (const file of dir.files) {
    results.push(file);
  }
  return results.sort(nodeLabelSort);
}

function compactDir(dir: MutableDir, repoId: string): FileTreeNode {
  let label = dir.label;
  let current = dir;
  while (current.files.length === 0 && current.dirs.size === 1) {
    const only = [...current.dirs.values()][0];
    if (!only) {
      break;
    }
    label = `${label}/${only.label}`;
    current = only;
  }
  const children = materializeDirs(current, repoId);
  return {
    id: `dir::${repoId}::${current.fullPath}`,
    label,
    description: '',
    repoId,
    relativePath: null,
    kind: 'directory',
    changeKind: null,
    collapsible: true,
    children,
    baseCommit: null,
    previousPath: null,
    additions: EMPTY_COUNT,
    deletions: EMPTY_COUNT,
    reviewed: false
  };
}
