import { describe, expect, it } from 'vitest';
import { ReviewCoordinator, fileKeyOf } from '../../src/application/ReviewCoordinator';
import { PRESET_LAST_WEEK } from '../../src/config/constants';
import type { ChangedFile, FileTreeNode, RepositoryDescriptor, ReviewScope } from '../../src/domain/models';
import type { IChangeCollector, IClock, IRepositoryDiscovery } from '../../src/domain/ports';
import { MemoryReviewStateStore } from '../../src/infrastructure/MemoryReviewStateStore';
import { FakeClock } from './helpers/fakeGit';

function repo(id: string, name: string): RepositoryDescriptor {
  return { id, name, rootPath: id, hasHead: true, upstreamRef: null };
}

function makeFile(
  repoDesc: RepositoryDescriptor,
  relativePath: string,
  counts: { additions: number; deletions: number } = { additions: 0, deletions: 0 }
): ChangedFile {
  return {
    repo: repoDesc,
    relativePath,
    previousPath: null,
    kind: 'modified',
    statusFlags: ['modified'],
    baseCommit: 'base',
    ranges: [],
    deletionAnchors: [],
    additions: counts.additions,
    deletions: counts.deletions
  };
}

class FakeDiscovery implements IRepositoryDiscovery {
  constructor(private readonly repos: readonly RepositoryDescriptor[]) {}
  async discover(): Promise<readonly RepositoryDescriptor[]> {
    return this.repos;
  }
}

class FakeCollector implements IChangeCollector {
  calls: { repos: readonly RepositoryDescriptor[]; scope: ReviewScope }[] = [];
  constructor(private readonly files: ChangedFile[], private readonly errors: readonly string[] = []) {}
  async collect(repos: readonly RepositoryDescriptor[], scope: ReviewScope): Promise<{ files: readonly ChangedFile[]; errors: readonly string[] }> {
    this.calls.push({ repos, scope });
    return { files: this.files, errors: this.errors };
  }
}

describe('ReviewCoordinator', () => {
  it('aggregates multiple repos', async () => {
    const repoA = repo('/a', 'a');
    const repoB = repo('/b', 'b');
    const collector = new FakeCollector([makeFile(repoA, 'a.ts'), makeFile(repoB, 'b.ts')]);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA, repoB]), collector, new FakeClock(new Date()), 300);
    await coordinator.refresh();
    expect(collector.calls).toHaveLength(1);
    expect(coordinator.getSnapshot().files).toHaveLength(2);
  });

  it('updates scope with setLastN', async () => {
    const repoA = repo('/a', 'a');
    const collector = new FakeCollector([]);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.setLastN(4);
    expect(collector.calls[0]?.scope).toEqual({ kind: 'last-n', commitCount: 4 });
    expect(coordinator.getSnapshot().scopeLabel).toContain('4');
  });

  it('labels the branch scope', async () => {
    const repoA = repo('/a', 'a');
    const collector = new FakeCollector([]);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.setScope({ kind: 'branch' });
    expect(coordinator.getSnapshot().scopeLabel).toBe('Current branch');
    expect(collector.calls[0]?.scope).toEqual({ kind: 'branch' });
  });

  it('rejects invalid N', async () => {
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([]), new FakeCollector([]), new FakeClock(new Date()), 300);
    await expect(coordinator.setLastN(0)).rejects.toThrow();
  });

  it('sets date preset durations', async () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([]), new FakeCollector([]), new FakeClock(now), 300);
    await coordinator.setDatePreset(PRESET_LAST_WEEK);
    const scope = coordinator.getSnapshot().scope;
    expect(scope.kind).toBe('date-range');
    if (scope.kind === 'date-range') {
      expect(Date.parse(scope.until) - Date.parse(scope.since)).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('toggles view mode without dropping files', async () => {
    const repoA = repo('/a', 'a');
    const collector = new FakeCollector([makeFile(repoA, 'a.ts')]);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.refresh();
    const before = coordinator.getSnapshot().files.map((file) => `${file.repo.id}::${file.relativePath}`);
    await coordinator.toggleViewMode();
    expect(coordinator.getSnapshot().viewMode).toBe('flat');
    const after = coordinator.getSnapshot().files.map((file) => `${file.repo.id}::${file.relativePath}`);
    expect(after).toEqual(before);
    expect(collector.calls).toHaveLength(1);
  });

  it('does not filter files from the snapshot', async () => {
    const repoA = repo('/a', 'a');
    const files = [makeFile(repoA, 'one.ts'), makeFile(repoA, 'two.ts'), makeFile(repoA, 'three.ts')];
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), new FakeCollector(files), new FakeClock(new Date()), 300);
    await coordinator.refresh();
    expect(coordinator.getSnapshot().files).toHaveLength(3);
  });

  it('toggles session-only reviewed state without touching the collector', async () => {
    const repoA = repo('/a', 'a');
    const files = [makeFile(repoA, 'one.ts', { additions: 5, deletions: 1 }), makeFile(repoA, 'two.ts')];
    const collector = new FakeCollector(files);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.refresh();
    expect(collector.calls).toHaveLength(1);

    const key = fileKeyOf(files[0]!);
    coordinator.toggleReviewed(key);
    expect(coordinator.getReviewedKeys()).toEqual(new Set([key]));
    expect(treeFileNode(coordinator, 'one.ts')?.reviewed).toBe(true);
    expect(treeFileNode(coordinator, 'two.ts')?.reviewed).toBe(false);

    coordinator.toggleReviewed(key);
    expect(coordinator.getReviewedKeys().size).toBe(0);
  });

  it('marks all files reviewed and clears again', async () => {
    const repoA = repo('/a', 'a');
    const files = [makeFile(repoA, 'one.ts'), makeFile(repoA, 'two.ts'), makeFile(repoA, 'three.ts')];
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), new FakeCollector(files), new FakeClock(new Date()), 300);
    await coordinator.refresh();
    coordinator.markAllReviewed();
    expect(coordinator.getReviewedKeys()).toEqual(new Set(files.map(fileKeyOf)));
    expect(coordinator.getSnapshot().tree.every((node) => node.kind !== 'file' || node.reviewed)).toBe(true);
    coordinator.clearReviewed();
    expect(coordinator.getReviewedKeys().size).toBe(0);
  });

  it('keeps reviewed keys across a live refresh of the same files', async () => {
    const repoA = repo('/a', 'a');
    const files = [makeFile(repoA, 'one.ts')];
    const collector = new FakeCollector(files);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.refresh();
    coordinator.toggleReviewed(fileKeyOf(files[0]!));
    await coordinator.refresh();
    expect(coordinator.getReviewedKeys()).toEqual(new Set([fileKeyOf(files[0]!)]));
    expect(treeFileNode(coordinator, 'one.ts')?.reviewed).toBe(true);
  });

  it('builds tree nodes with the per-file counts the collector reported', async () => {
    const repoA = repo('/a', 'a');
    const files = [makeFile(repoA, 'one.ts', { additions: 12, deletions: 3 })];
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), new FakeCollector(files), new FakeClock(new Date()), 300);
    await coordinator.refresh();
    const node = treeFileNode(coordinator, 'one.ts');
    expect(node).toMatchObject({ additions: 12, deletions: 3, reviewed: false });
  });

  it('isolates repo errors', async () => {
    const repoA = repo('/a', 'a');
    const collector = new FakeCollector([makeFile(repoA, 'a.ts')], ['[b] boom']);
    const coordinator = new ReviewCoordinator(new MemoryReviewStateStore(), new FakeDiscovery([repoA]), collector, new FakeClock(new Date()), 300);
    await coordinator.refresh();
    expect(coordinator.getSnapshot().files).toHaveLength(1);
    expect(coordinator.getSnapshot().errors).toHaveLength(1);
  });

  it('uses an injected clock', () => {
    const clock: IClock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().getFullYear()).toBe(2026);
  });
});

function treeFileNode(coordinator: ReviewCoordinator, relativePath: string): FileTreeNode | null {
  return findFileNode(coordinator.getSnapshot().tree, relativePath);
}

function findFileNode(nodes: readonly FileTreeNode[], relativePath: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.kind === 'file' && node.relativePath === relativePath) {
      return node;
    }
    const nested = findFileNode(node.children, relativePath);
    if (nested) {
      return nested;
    }
  }
  return null;
}
