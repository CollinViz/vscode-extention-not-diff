import {
  DAYS_IN_WEEK,
  EMPTY_COUNT,
  END_OF_DAY_HOUR,
  END_OF_DAY_MILLISECOND,
  END_OF_DAY_MINUTE,
  END_OF_DAY_SECOND,
  FIRST_INDEX,
  GIT_EMPTY_TREE_HASH,
  HOURS_PER_DAY,
  MIN_COMMIT_COUNT,
  MS_PER_DAY,
  PRESET_CUSTOM,
  PRESET_LAST_24_HOURS,
  PRESET_LAST_3_DAYS,
  PRESET_LAST_WEEK,
  THREE_DAYS
} from '../config/constants';
import { InvalidScopeError, type RepoHistorySnapshot, type ResolvedBase, type ReviewScope } from './models';

export function parseIsoMs(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new InvalidScopeError(`Invalid ISO date: ${value}`);
  }
  return ms;
}

export function expandDatePreset(presetId: string, now: Date): { since: string; until: string } {
  const untilMs = now.getTime();
  if (presetId === PRESET_LAST_24_HOURS) {
    return { since: new Date(untilMs - HOURS_PER_DAY * (MS_PER_DAY / HOURS_PER_DAY)).toISOString(), until: now.toISOString() };
  }
  if (presetId === PRESET_LAST_3_DAYS) {
    return { since: new Date(untilMs - THREE_DAYS * MS_PER_DAY).toISOString(), until: now.toISOString() };
  }
  if (presetId === PRESET_LAST_WEEK) {
    return { since: new Date(untilMs - DAYS_IN_WEEK * MS_PER_DAY).toISOString(), until: now.toISOString() };
  }
  throw new InvalidScopeError(`Unknown date preset: ${presetId}`);
}

export function customDateRangeToIso(startDate: string, endDate: string): { since: string; until: string } {
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  if (startParts.length !== THREE_DAYS || endParts.length !== THREE_DAYS || startParts.some(Number.isNaN) || endParts.some(Number.isNaN)) {
    throw new InvalidScopeError(`Invalid custom date range: ${startDate} .. ${endDate}`);
  }
  const since = new Date(startParts[FIRST_INDEX] ?? EMPTY_COUNT, (startParts[1] ?? 1) - 1, startParts[2] ?? 1, EMPTY_COUNT, EMPTY_COUNT, EMPTY_COUNT, EMPTY_COUNT);
  const until = new Date(
    endParts[FIRST_INDEX] ?? EMPTY_COUNT,
    (endParts[1] ?? 1) - 1,
    endParts[2] ?? 1,
    END_OF_DAY_HOUR,
    END_OF_DAY_MINUTE,
    END_OF_DAY_SECOND,
    END_OF_DAY_MILLISECOND
  );
  if (until.getTime() < since.getTime()) {
    throw new InvalidScopeError(`Invalid custom date range: end is before start`);
  }
  return { since: since.toISOString(), until: until.toISOString() };
}

export function resolveBase(scope: ReviewScope, history: RepoHistorySnapshot): ResolvedBase {
  if (history.headSha === null || history.commitsNewestFirst.length === EMPTY_COUNT) {
    return { baseCommit: GIT_EMPTY_TREE_HASH, reason: 'unborn-head' };
  }
  if (scope.kind === 'last-n') {
    return resolveLastN(scope.commitCount, history);
  }
  if (scope.kind === 'branch') {
    return resolveBranch(history.branchBaseSha ?? null, history);
  }
  return resolveDateRange(scope.since, scope.until, history);
}

function resolveLastN(commitCount: number, history: RepoHistorySnapshot): ResolvedBase {
  const clamped = Math.max(Math.trunc(commitCount), MIN_COMMIT_COUNT);
  const available = history.commitsNewestFirst.length;
  let windowBase: string;
  let reason: ResolvedBase['reason'];
  if (available <= clamped) {
    windowBase = GIT_EMPTY_TREE_HASH;
    reason = 'short-history';
  } else {
    windowBase = history.commitsNewestFirst[clamped]?.sha ?? GIT_EMPTY_TREE_HASH;
    reason = 'last-n';
  }
  return widenForUnpushed(windowBase, reason, clamped, history);
}

function resolveDateRange(since: string, until: string, history: RepoHistorySnapshot): ResolvedBase {
  const sinceMs = parseIsoMs(since);
  const untilMs = parseIsoMs(until);
  if (untilMs < sinceMs) {
    throw new InvalidScopeError('Invalid date range: until is before since');
  }
  let oldestMatchIndex = -1;
  for (let index = FIRST_INDEX; index < history.commitsNewestFirst.length; index += 1) {
    const commit = history.commitsNewestFirst[index];
    if (!commit) {
      continue;
    }
    const commitMs = parseIsoMs(commit.committedAt);
    if (commitMs >= sinceMs && commitMs <= untilMs) {
      oldestMatchIndex = index;
    }
  }
  if (oldestMatchIndex === -1) {
    const fallbackBase = history.headSha ?? GIT_EMPTY_TREE_HASH;
    const excludedIndex = FIRST_INDEX;
    return widenForUnpushed(fallbackBase, 'empty-date-window', excludedIndex, history);
  }
  const parentIndex = oldestMatchIndex + 1;
  const windowBase = parentIndex < history.commitsNewestFirst.length
    ? (history.commitsNewestFirst[parentIndex]?.sha ?? GIT_EMPTY_TREE_HASH)
    : GIT_EMPTY_TREE_HASH;
  void PRESET_CUSTOM;
  return widenForUnpushed(windowBase, 'date-range', parentIndex, history);
}

function resolveBranch(branchBaseSha: string | null, history: RepoHistorySnapshot): ResolvedBase {
  if (branchBaseSha === null) {
    const fallbackBase = history.headSha ?? GIT_EMPTY_TREE_HASH;
    return { baseCommit: fallbackBase, reason: 'branch-no-base' };
  }
  // The merge-base fully defines branch-local changes; never widen toward the
  // branch's own upstream here, which would pull base-branch history back in.
  return { baseCommit: branchBaseSha, reason: 'branch' };
}

function widenForUnpushed(
  windowBase: string,
  reason: ResolvedBase['reason'],
  excludedIndex: number,
  history: RepoHistorySnapshot
): ResolvedBase {
  if (history.upstreamSha === null || history.upstreamSha === history.headSha) {
    return { baseCommit: windowBase, reason };
  }
  const upstreamIndex = history.commitsNewestFirst.findIndex((commit) => commit.sha === history.upstreamSha);
  if (upstreamIndex === -1) {
    return { baseCommit: windowBase, reason };
  }
  if (windowBase === GIT_EMPTY_TREE_HASH) {
    return { baseCommit: windowBase, reason };
  }
  if (upstreamIndex > excludedIndex) {
    return { baseCommit: history.upstreamSha, reason: 'unpushed-widened' };
  }
  return { baseCommit: windowBase, reason };
}
