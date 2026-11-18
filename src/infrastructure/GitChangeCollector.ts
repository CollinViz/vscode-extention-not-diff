import {
  BASE_BRANCH_CANDIDATES,
  GIT_EMPTY_TREE_HASH,
  GIT_HEAD,
  PORCELAIN_STATUS_PREFIX_LENGTH,
  REFS_REMOTES_PREFIX,
  STATUS_ADDED,
  STATUS_COPIED,
  STATUS_DELETED,
  STATUS_MODIFIED,
  STATUS_RENAMED,
  STATUS_UNMERGED,
  STATUS_UNTRACKED
} from '../config/constants';
import { highlightRanges, parseUnifiedDiff } from '../domain/DiffHunkParser';
import { resolveBase } from '../domain/ScopeBaseResolver';
import { compareFiles } from '../domain/FileTreeBuilder';
import type {
  ChangeKind,
  ChangedFile,
  CommitRef,
  LineRange,
  RepositoryDescriptor,
  ReviewScope
} from '../domain/models';
import type { IChangeCollector, IClock, IFileSystem, IGitExecutor } from '../domain/ports';
import {
  diffCachedNameStatusArgs,
  diffCachedUnifiedZeroArgs,
  diffNameStatusArgs,
  diffUnifiedZeroArgs,
  headRevParseArgs,
  mergeBaseArgs,
  originHeadArgs,
  revListArgs,
  statusPorcelainArgs,
  unpushedNameStatusArgs,
  upstreamRevParseArgs,
  verifyRefArgs
} from './gitArguments';
import { absoluteFromRoot, toPosixPath } from '../util/paths';
import { formatRepoError } from '../util/errors';

export class GitChangeCollector implements IChangeCollector {
  constructor(
    private readonly git: IGitExecutor,
    private readonly fs: IFileSystem,
    private readonly clock: IClock
  ) {
    void this.clock;
  }

  async collect(
    repos: readonly RepositoryDescriptor[],
    scope: ReviewScope
  ): Promise<{ files: readonly ChangedFile[]; errors: readonly string[] }> {
    const files: ChangedFile[] = [];
    const errors: string[] = [];
    for (const repo of repos) {
      try {
        const repoFiles = await this.collectOne(repo, scope);
        files.push(...repoFiles);
      } catch (error) {
        errors.push(formatRepoError(repo.name, error instanceof Error ? error.message : String(error)));
      }
    }
    return { files: [...files].sort(compareFiles), errors };
  }

  private async collectOne(repo: RepositoryDescriptor, scope: ReviewScope): Promise<readonly ChangedFile[]> {
    const headSha = await this.resolveHead(repo.rootPath);
    const commits = headSha === null ? [] : await this.readHistory(repo.rootPath);
    const upstreamSha = await this.resolveUpstream(repo.rootPath);
    const effectiveHead = headSha ?? (commits[0]?.sha ?? null);
    const branchBaseSha = scope.kind === 'branch' && effectiveHead !== null
      ? await this.resolveBranchBase(repo.rootPath)
      : null;
    const resolved = resolveBase(scope, {
      commitsNewestFirst: commits,
      headSha: effectiveHead,
      upstreamSha,
      hasDirtyWorktree: false,
      branchBaseSha
    });
    const base = resolved.baseCommit;
    const headRef = headSha ?? GIT_EMPTY_TREE_HASH;

    const entries = new Map<string, { kind: ChangeKind; previousPath: string | null; flags: Set<ChangeKind> }>();
    const record = (relativePath: string, kind: ChangeKind, previousPath: string | null = null): void => {
      const posix = toPosixPath(relativePath);
      const existing = entries.get(posix);
      if (!existing) {
        entries.set(posix, { kind, previousPath, flags: new Set([kind]) });
        return;
      }
      existing.flags.add(kind);
      if (existing.kind === 'modified' && kind !== 'modified') {
        existing.kind = kind;
      }
      if (previousPath && !existing.previousPath) {
        existing.previousPath = previousPath;
      }
    };

    for (const row of this.parseNameStatus((await this.git.exec(repo.rootPath, diffNameStatusArgs(base))).stdout)) {
      record(row.to, row.kind, row.from);
    }
    for (const row of this.parseNameStatus((await this.git.exec(repo.rootPath, diffCachedNameStatusArgs(headRef))).stdout)) {
      record(row.to, row.kind, row.from);
    }
    if (upstreamSha && scope.kind !== 'branch') {
      const upstreamResult = await this.git.exec(repo.rootPath, unpushedNameStatusArgs(upstreamSha));
      if (upstreamResult.exitCode === 0) {
        for (const row of this.parseNameStatus(upstreamResult.stdout)) {
          record(row.to, row.kind, row.from);
        }
      }
    }
    for (const untracked of this.parseUntracked((await this.git.exec(repo.rootPath, statusPorcelainArgs())).stdout)) {
      record(untracked, 'untracked');
    }

    const out: ChangedFile[] = [];
    for (const [relativePath, entry] of entries) {
      const ranges: LineRange[] = [];
      const deletionAnchors: number[] = [];
      if (entry.kind === 'untracked') {
        const absolute = absoluteFromRoot(repo.rootPath, relativePath);
        const text = await this.safeRead(absolute);
        if (text !== null) {
          const lineCount = countLines(text);
          if (lineCount > 0) {
            ranges.push({ start: 0, end: lineCount });
          }
        }
      } else if (entry.kind !== 'deleted') {
        const unified = await this.git.exec(repo.rootPath, diffUnifiedZeroArgs(base, relativePath));
        if (unified.exitCode === 0) {
          for (const range of highlightRanges(parseUnifiedDiff(unified.stdout))) {
            ranges.push(range);
          }
          for (const hunk of parseUnifiedDiff(unified.stdout)) {
            if (hunk.deletionAnchor !== null) {
              deletionAnchors.push(hunk.deletionAnchor);
            }
          }
        }
        const cached = await this.git.exec(repo.rootPath, diffCachedUnifiedZeroArgs(relativePath));
        if (cached.exitCode === 0) {
          for (const range of highlightRanges(parseUnifiedDiff(cached.stdout))) {
            if (!ranges.some((existing) => existing.start === range.start && existing.end === range.end)) {
              ranges.push(range);
            }
          }
        }
      }
      out.push({
        repo,
        relativePath,
        previousPath: entry.previousPath,
        kind: entry.kind,
        statusFlags: [...entry.flags],
        baseCommit: base,
        ranges: mergeRanges(ranges),
        deletionAnchors
      });
    }
    return out.sort(compareFiles);
  }

  private async resolveBranchBase(root: string): Promise<string | null> {
    const candidates: string[] = [];
    const originHead = await this.git.exec(root, originHeadArgs());
    if (originHead.exitCode === 0) {
      const fullRef = originHead.stdout.trim().split('\n')[0]?.trim() ?? '';
      const shortRef = fullRef.startsWith(REFS_REMOTES_PREFIX) ? fullRef.slice(REFS_REMOTES_PREFIX.length) : '';
      if (shortRef !== '') {
        candidates.push(shortRef);
      }
    }
    for (const candidate of BASE_BRANCH_CANDIDATES) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
    let baseRef: string | null = null;
    for (const candidate of candidates) {
      const verified = await this.git.exec(root, verifyRefArgs(candidate));
      if (verified.exitCode === 0) {
        baseRef = candidate;
        break;
      }
    }
    if (baseRef === null) {
      return null;
    }
    const mergeBase = await this.git.exec(root, mergeBaseArgs(GIT_HEAD, baseRef));
    if (mergeBase.exitCode !== 0) {
      return null;
    }
    const sha = mergeBase.stdout.trim().split('\n')[0]?.trim() ?? '';
    return sha === '' ? null : sha;
  }

  private async resolveHead(root: string): Promise<string | null> {
    const result = await this.git.exec(root, headRevParseArgs());
    if (result.exitCode !== 0) {
      return null;
    }
    const sha = result.stdout.trim();
    return sha === '' ? null : sha;
  }

  private async resolveUpstream(root: string): Promise<string | null> {
    const result = await this.git.exec(root, upstreamRevParseArgs());
    if (result.exitCode !== 0) {
      return null;
    }
    const sha = result.stdout.trim().split('\n')[0]?.trim() ?? '';
    return sha === '' ? null : sha;
  }

  private async readHistory(root: string): Promise<CommitRef[]> {
    const result = await this.git.exec(root, revListArgs());
    if (result.exitCode !== 0) {
      return [];
    }
    const commits: CommitRef[] = [];
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') {
        continue;
      }
      const tab = trimmed.indexOf('\t');
      if (tab === -1) {
        continue;
      }
      commits.push({ sha: trimmed.slice(0, tab), committedAt: trimmed.slice(tab + 1) });
    }
    return commits;
  }

  private parseNameStatus(stdout: string): { kind: ChangeKind; from: string | null; to: string }[] {
    const rows: { kind: ChangeKind; from: string | null; to: string }[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      const parts = line.split('\t');
      const status = (parts[0] ?? '').trim();
      const letter = status.charAt(0);
      if (status.startsWith(STATUS_RENAMED) || status.startsWith(STATUS_COPIED)) {
        const from = parts[1] ?? '';
        const to = parts[2] ?? '';
        if (to === '') {
          continue;
        }
        rows.push({ kind: status.startsWith(STATUS_RENAMED) ? 'renamed' : 'copied', from, to });
        continue;
      }
      const path = parts[1] ?? '';
      if (path === '') {
        continue;
      }
      rows.push({ kind: toChangeKind(letter), from: null, to: path });
    }
    return rows;
  }

  private parseUntracked(stdout: string): string[] {
    // Porcelain -z is NUL separated; exec may preserve NULs in stdout.
    const paths: string[] = [];
    for (const chunk of stdout.split('\0')) {
      for (const line of chunk.split('\n')) {
        if (line.startsWith('??')) {
          const path = line.slice(PORCELAIN_STATUS_PREFIX_LENGTH).trim();
          if (path !== '') {
            paths.push(path);
          }
        }
      }
    }
    return paths;
  }

  private async safeRead(absolute: string): Promise<string | null> {
    try {
      if (!(await this.fs.exists(absolute))) {
        return null;
      }
      return await this.fs.readTextFile(absolute);
    } catch {
      return null;
    }
  }
}

export function toChangeKind(letter: string): ChangeKind {
  if (letter === STATUS_ADDED) {
    return 'added';
  }
  if (letter === STATUS_DELETED) {
    return 'deleted';
  }
  if (letter === STATUS_RENAMED) {
    return 'renamed';
  }
  if (letter === STATUS_COPIED) {
    return 'copied';
  }
  if (letter === STATUS_UNTRACKED) {
    return 'untracked';
  }
  if (letter === STATUS_UNMERGED) {
    return 'unmerged';
  }
  if (letter === STATUS_MODIFIED) {
    return 'modified';
  }
  return 'modified';
}

function countLines(text: string): number {
  if (text === '') {
    return 0;
  }
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    return parts.length - 1;
  }
  return parts.length;
}

function mergeRanges(ranges: readonly LineRange[]): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}
