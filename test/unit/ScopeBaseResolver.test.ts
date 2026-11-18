import { describe, expect, it } from 'vitest';
import { DEFAULT_COMMIT_COUNT, GIT_EMPTY_TREE_HASH, MS_PER_DAY, THREE_DAYS, DAYS_IN_WEEK } from '../../src/config/constants';
import { expandDatePreset, resolveBase } from '../../src/domain/ScopeBaseResolver';
import { InvalidScopeError, type CommitRef, type RepoHistorySnapshot } from '../../src/domain/models';
import { FakeClock } from './helpers/fakeGit';

function commitsWithDates(count: number, startMs: number, stepMs: number): CommitRef[] {
  const commits: CommitRef[] = [];
  for (let i = 0; i < count; i += 1) {
    commits.push({ sha: `sha-${i}`, committedAt: new Date(startMs - i * stepMs).toISOString() });
  }
  return commits;
}

function history(commits: CommitRef[], overrides: Partial<RepoHistorySnapshot> = {}): RepoHistorySnapshot {
  return {
    commitsNewestFirst: commits,
    headSha: commits[0]?.sha ?? null,
    upstreamSha: null,
    hasDirtyWorktree: false,
    branchBaseSha: null,
    ...overrides
  };
}

describe('ScopeBaseResolver', () => {
  it('resolves default last N', () => {
    const commits = commitsWithDates(15, Date.now(), 1000);
    const resolved = resolveBase({ kind: 'last-n', commitCount: DEFAULT_COMMIT_COUNT }, history(commits));
    expect(resolved.baseCommit).toBe(commits[DEFAULT_COMMIT_COUNT]?.sha);
    expect(resolved.reason).toBe('last-n');
  });

  it('falls back to empty tree for fewer than N', () => {
    const commits = commitsWithDates(3, Date.now(), 1000);
    const resolved = resolveBase({ kind: 'last-n', commitCount: 10 }, history(commits));
    expect(resolved.baseCommit).toBe(GIT_EMPTY_TREE_HASH);
    expect(resolved.reason).toBe('short-history');
  });

  it('falls back to empty tree for exactly N', () => {
    const commits = commitsWithDates(10, Date.now(), 1000);
    const resolved = resolveBase({ kind: 'last-n', commitCount: 10 }, history(commits));
    expect(resolved.baseCommit).toBe(GIT_EMPTY_TREE_HASH);
  });

  it('handles unborn HEAD', () => {
    const resolved = resolveBase({ kind: 'last-n', commitCount: 10 }, history([], { headSha: null }));
    expect(resolved.baseCommit).toBe(GIT_EMPTY_TREE_HASH);
    expect(resolved.reason).toBe('unborn-head');
  });

  it('resolves 24h preset window', () => {
    const now = new Date('2026-01-02T12:00:00.000Z');
    const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const older = new Date(now.getTime() - 3 * MS_PER_DAY).toISOString();
    const commits: CommitRef[] = [
      { sha: 'new', committedAt: recent },
      { sha: 'old', committedAt: older }
    ];
    const { since, until } = expandDatePreset('last-24-hours', now);
    const resolved = resolveBase({ kind: 'date-range', since, until, presetId: 'last-24-hours' }, history(commits));
    expect(resolved.baseCommit).toBe('old');
    expect(resolved.reason).toBe('date-range');
  });

  it('excludes commits outside the 3d preset', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const clock = new FakeClock(now);
    const { since, until } = expandDatePreset('last-3-days', clock.now());
    const commits: CommitRef[] = [
      { sha: 'day1', committedAt: new Date(now.getTime() - MS_PER_DAY).toISOString() },
      { sha: 'day5', committedAt: new Date(now.getTime() - 5 * MS_PER_DAY).toISOString() }
    ];
    const resolved = resolveBase({ kind: 'date-range', since, until, presetId: 'last-3-days' }, history(commits));
    expect(resolved.baseCommit).toBe('day5');
  });

  it('handles week preset boundaries', () => {
    const now = new Date('2026-01-10T00:00:00.000Z');
    const { since, until } = expandDatePreset('last-week', now);
    const commits: CommitRef[] = [
      { sha: 'day6', committedAt: new Date(now.getTime() - 6 * MS_PER_DAY).toISOString() },
      { sha: 'day8', committedAt: new Date(now.getTime() - 8 * MS_PER_DAY).toISOString() }
    ];
    const resolved = resolveBase({ kind: 'date-range', since, until, presetId: 'last-week' }, history(commits));
    expect(resolved.baseCommit).toBe('day8');
  });

  it('resolves custom ranges to the oldest match parent', () => {
    const commits = commitsWithDates(5, Date.parse('2026-01-05T00:00:00.000Z'), MS_PER_DAY);
    const since = commits[2]?.committedAt ?? '';
    const until = commits[1]?.committedAt ?? '';
    const resolved = resolveBase({ kind: 'date-range', since, until, presetId: 'custom' }, history(commits));
    expect(resolved.baseCommit).toBe(commits[3]?.sha);
  });

  it('falls back to HEAD for an empty date window with dirty worktree', () => {
    const commits = commitsWithDates(2, Date.parse('2020-01-01T00:00:00.000Z'), 1000);
    const resolved = resolveBase(
      { kind: 'date-range', since: '2026-01-01T00:00:00.000Z', until: '2026-01-02T00:00:00.000Z', presetId: 'custom' },
      history(commits, { hasDirtyWorktree: true })
    );
    expect(resolved.baseCommit).toBe(commits[0]?.sha);
    expect(resolved.reason).toBe('empty-date-window');
  });

  it('falls back to empty tree for empty window without head', () => {
    const resolved = resolveBase(
      { kind: 'date-range', since: '2026-01-01T00:00:00.000Z', until: '2026-01-02T00:00:00.000Z', presetId: 'custom' },
      history([], { headSha: null })
    );
    expect(resolved.baseCommit).toBe(GIT_EMPTY_TREE_HASH);
  });

  it('widens for unpushed commits beyond N', () => {
    const commits = commitsWithDates(20, Date.now(), 1000);
    const upstream = commits[12]?.sha ?? null;
    const resolved = resolveBase({ kind: 'last-n', commitCount: 3 }, history(commits, { upstreamSha: upstream }));
    expect(resolved.baseCommit).toBe(upstream);
    expect(resolved.reason).toBe('unpushed-widened');
  });

  it('widens for unpushed commits older than the date window', () => {
    const commits = commitsWithDates(12, Date.now(), MS_PER_DAY);
    const upstream = commits[10]?.sha ?? null;
    const resolved = resolveBase(
      { kind: 'date-range', since: commits[0]?.committedAt ?? '', until: commits[0]?.committedAt ?? '', presetId: 'custom' },
      history(commits, { upstreamSha: upstream })
    );
    expect(resolved.baseCommit).toBe(upstream);
    expect(resolved.reason).toBe('unpushed-widened');
  });

  it('keeps window base without upstream', () => {
    const commits = commitsWithDates(20, Date.now(), 1000);
    const resolved = resolveBase({ kind: 'last-n', commitCount: 3 }, history(commits));
    expect(resolved.baseCommit).toBe(commits[3]?.sha);
    expect(resolved.reason).toBe('last-n');
  });

  it('throws for invalid custom ranges', () => {
    expect(() =>
      resolveBase(
        { kind: 'date-range', since: '2026-02-01T00:00:00.000Z', until: '2026-01-01T00:00:00.000Z', presetId: 'custom' },
        history(commitsWithDates(2, Date.now(), 1000))
      )
    ).toThrow(InvalidScopeError);
  });

  it('expands preset durations', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const day = expandDatePreset('last-24-hours', now);
    expect(Date.parse(day.until) - Date.parse(day.since)).toBe(MS_PER_DAY);
    const three = expandDatePreset('last-3-days', now);
    expect(Date.parse(three.until) - Date.parse(three.since)).toBe(THREE_DAYS * MS_PER_DAY);
    const week = expandDatePreset('last-week', now);
    expect(Date.parse(week.until) - Date.parse(week.since)).toBe(DAYS_IN_WEEK * MS_PER_DAY);
  });

  it('resolves branch scope to the merge-base', () => {
    const commits = commitsWithDates(12, Date.now(), 1000);
    const mergeBase = commits[4]?.sha ?? '';
    const resolved = resolveBase({ kind: 'branch' }, history(commits, { branchBaseSha: mergeBase }));
    expect(resolved.baseCommit).toBe(mergeBase);
    expect(resolved.reason).toBe('branch');
  });

  it('resolves branch scope to HEAD when already on the base branch', () => {
    const commits = commitsWithDates(5, Date.now(), 1000);
    const head = commits[0]?.sha ?? null;
    const resolved = resolveBase({ kind: 'branch' }, history(commits, { branchBaseSha: head }));
    expect(resolved.baseCommit).toBe(head);
    expect(resolved.reason).toBe('branch');
  });

  it('falls back to HEAD for branch scope without a detectable base', () => {
    const commits = commitsWithDates(5, Date.now(), 1000);
    const resolved = resolveBase({ kind: 'branch' }, history(commits, { branchBaseSha: null }));
    expect(resolved.baseCommit).toBe(commits[0]?.sha);
    expect(resolved.reason).toBe('branch-no-base');
  });

  it('does not widen branch scope toward a stale upstream', () => {
    const commits = commitsWithDates(12, Date.now(), 1000);
    const mergeBase = commits[4]?.sha ?? '';
    const staleUpstream = commits[8]?.sha ?? null;
    const resolved = resolveBase({ kind: 'branch' }, history(commits, { branchBaseSha: mergeBase, upstreamSha: staleUpstream }));
    expect(resolved.baseCommit).toBe(mergeBase);
    expect(resolved.reason).toBe('branch');
  });
});
