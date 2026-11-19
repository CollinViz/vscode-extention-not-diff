import { describe, expect, it } from 'vitest';
import { buildTree, changedFileKey } from '../../src/domain/FileTreeBuilder';
import type { ChangedFile, ChangeKind, FileTreeNode, RepositoryDescriptor } from '../../src/domain/models';

function repo(id: string, name: string): RepositoryDescriptor {
  return { id, name, rootPath: id, hasHead: true, upstreamRef: null };
}

function file(
  repoDesc: RepositoryDescriptor,
  relativePath: string,
  kind: ChangeKind = 'modified',
  counts: { additions: number; deletions: number } = { additions: 0, deletions: 0 }
): ChangedFile {
  return {
    repo: repoDesc,
    relativePath,
    previousPath: null,
    kind,
    statusFlags: [kind],
    baseCommit: 'base',
    ranges: [],
    deletionAnchors: [],
    additions: counts.additions,
    deletions: counts.deletions
  };
}

function fileKeys(nodes: readonly FileTreeNode[]): string[] {
  const keys: string[] = [];
  const walk = (nodeList: readonly FileTreeNode[]): void => {
    for (const node of nodeList) {
      if (node.kind === 'file' && node.repoId && node.relativePath) {
        keys.push(changedFileKey(node.repoId, node.relativePath));
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return keys.sort();
}

describe('FileTreeBuilder', () => {
  it('builds a pruned tree', () => {
    const repoA = repo('/repoA', 'repoA');
    const files = [file(repoA, 'lib/utils/random.ts'), file(repoA, 'views/dashboard.tsx')];
    const tree = buildTree(files, 'tree');
    const labels = JSON.stringify(tree);
    expect(labels).toContain('lib');
    expect(labels).not.toContain('services');
    expect(labels).not.toContain('components');
  });

  it('compacts single-child chains', () => {
    const repoA = repo('/repoA', 'repoA');
    const tree = buildTree([file(repoA, 'a/b/c/file.ts')], 'tree');
    expect(tree).toHaveLength(1);
    expect(tree[0]?.label).toBe('a/b/c');
  });

  it('does not compact split directories', () => {
    const repoA = repo('/repoA', 'repoA');
    const tree = buildTree([file(repoA, 'lib/utils/random.ts'), file(repoA, 'lib/services/auth.ts')], 'tree');
    const lib = tree.find((node) => node.label === 'lib');
    expect(lib).toBeDefined();
    expect(lib?.children.map((child) => child.label).sort()).toEqual(['services', 'utils']);
  });

  it('preserves file keys across flat toggle', () => {
    const repoA = repo('/repoA', 'repoA');
    const files = [file(repoA, 'lib/utils/random.ts'), file(repoA, 'views/dashboard.tsx')];
    expect(fileKeys(buildTree(files, 'flat'))).toEqual(fileKeys(buildTree(files, 'tree')));
  });

  it('returns flat file nodes with repo badges', () => {
    const repoA = repo('/repoA', 'repoA');
    const flat = buildTree([file(repoA, 'src/index.ts')], 'flat');
    expect(flat[0]?.kind).toBe('file');
    expect(flat[0]?.label).toBe('src/index.ts');
    expect(flat[0]?.description).toBe('repoA');
  });

  it('disambiguates identical paths across repos', () => {
    const repoA = repo('/repoA', 'repoA');
    const repoB = repo('/repoB', 'repoB');
    const files = [file(repoA, 'src/index.ts'), file(repoB, 'src/index.ts')];
    const tree = buildTree(files, 'tree');
    expect(tree).toHaveLength(2);
    const keys = fileKeys(tree);
    expect(new Set(keys).size).toBe(2);
    const descs = new Set<string>();
    const walk = (nodeList: readonly FileTreeNode[]): void => {
      for (const node of nodeList) {
        if (node.kind === 'file') {
          descs.add(node.description);
        }
        walk(node.children);
      }
    };
    walk(tree);
    expect(descs).toEqual(new Set(['repoA', 'repoB']));
  });

  it('omits repo groups for a single repo but keeps badges', () => {
    const repoA = repo('/repoA', 'repoA');
    const tree = buildTree([file(repoA, 'src/index.ts')], 'tree');
    expect(tree.every((node) => node.kind !== 'repo')).toBe(true);
    const walkFiles: FileTreeNode[] = [];
    const walk = (nodeList: readonly FileTreeNode[]): void => {
      for (const node of nodeList) {
        if (node.kind === 'file') {
          walkFiles.push(node);
        }
        walk(node.children);
      }
    };
    walk(tree);
    expect(walkFiles).toHaveLength(1);
    expect(walkFiles[0]?.description).toBe('repoA');
  });

  it('sorts directories before files', () => {
    const repoA = repo('/repoA', 'repoA');
    const tree = buildTree([file(repoA, 'b.ts'), file(repoA, 'lib/a.ts'), file(repoA, 'c.ts')], 'tree');
    expect(tree[0]?.kind).toBe('directory');
  });

  it('includes deleted files in both modes', () => {
    const repoA = repo('/repoA', 'repoA');
    const files = [file(repoA, 'gone.ts', 'deleted')];
    expect(fileKeys(buildTree(files, 'tree'))).toHaveLength(1);
    expect(fileKeys(buildTree(files, 'flat'))).toHaveLength(1);
  });

  it('carries per-file +/− counts on file nodes in both modes', () => {
    const repoA = repo('/repoA', 'repoA');
    const files = [
      file(repoA, 'src/index.ts', 'modified', { additions: 18, deletions: 2 }),
      file(repoA, 'notes/todo.ts', 'untracked', { additions: 7, deletions: 0 })
    ];
    const treeFiles = collectFileNodes(buildTree(files, 'tree'));
    const flatFiles = collectFileNodes(buildTree(files, 'flat'));
    expect(treeFiles.find((node) => node.label === 'index.ts')).toMatchObject({ additions: 18, deletions: 2 });
    expect(flatFiles.find((node) => node.label === 'src/index.ts')).toMatchObject({ additions: 18, deletions: 2 });
    expect(collectFileNodes(buildTree(files, 'tree')).find((node) => node.label === 'todo.ts')).toMatchObject({ additions: 7, deletions: 0 });
  });

  it('marks reviewed keys on matching file nodes only', () => {
    const repoA = repo('/repoA', 'repoA');
    const files = [file(repoA, 'src/index.ts'), file(repoA, 'src/other.ts')];
    const reviewed = new Set([changedFileKey('/repoA', 'src/index.ts')]);
    const treeFiles = collectFileNodes(buildTree(files, 'tree', reviewed));
    expect(treeFiles.find((node) => node.label === 'index.ts')?.reviewed).toBe(true);
    expect(treeFiles.find((node) => node.label === 'other.ts')?.reviewed).toBe(false);
    expect(collectFileNodes(buildTree(files, 'flat', reviewed)).find((node) => node.label === 'src/index.ts')?.reviewed).toBe(true);
  });

  it('defaults to no reviewed files when the set is omitted', () => {
    const repoA = repo('/repoA', 'repoA');
    const treeFiles = collectFileNodes(buildTree([file(repoA, 'src/index.ts')], 'tree'));
    expect(treeFiles.every((node) => !node.reviewed)).toBe(true);
  });
});

function collectFileNodes(nodes: readonly FileTreeNode[]): FileTreeNode[] {
  const out: FileTreeNode[] = [];
  const walk = (list: readonly FileTreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'file') {
        out.push(node);
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
