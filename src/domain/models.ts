export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unmerged';

export type ViewMode = 'tree' | 'flat';

export type ReviewScope =
  | { readonly kind: 'last-n'; readonly commitCount: number }
  | { readonly kind: 'date-range'; readonly since: string; readonly until: string; readonly presetId: string }
  | { readonly kind: 'branch' };

export interface RepositoryDescriptor {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly hasHead: boolean;
  readonly upstreamRef: string | null;
}

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly kind: 'add' | 'delete' | 'modify';
  readonly highlight: LineRange | null;
  readonly deletionAnchor: number | null;
}

export interface ChangedFile {
  readonly repo: RepositoryDescriptor;
  readonly relativePath: string;
  readonly previousPath: string | null;
  readonly kind: ChangeKind;
  readonly statusFlags: readonly ChangeKind[];
  readonly baseCommit: string;
  readonly ranges: readonly LineRange[];
  readonly deletionAnchors: readonly number[];
  readonly additions: number;
  readonly deletions: number;
}

export interface FileTreeNode {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly repoId: string | null;
  readonly relativePath: string | null;
  readonly kind: 'repo' | 'directory' | 'file';
  readonly changeKind: ChangeKind | null;
  readonly collapsible: boolean;
  readonly children: readonly FileTreeNode[];
  readonly baseCommit: string | null;
  readonly previousPath: string | null;
  readonly additions: number;
  readonly deletions: number;
  readonly reviewed: boolean;
}

export interface CommitRef {
  readonly sha: string;
  readonly committedAt: string;
}

export interface RepoHistorySnapshot {
  readonly commitsNewestFirst: readonly CommitRef[];
  readonly headSha: string | null;
  readonly upstreamSha: string | null;
  readonly hasDirtyWorktree: boolean;
  readonly branchBaseSha: string | null;
}

export interface ResolvedBase {
  readonly baseCommit: string;
  readonly reason: 'last-n' | 'short-history' | 'unborn-head' | 'date-range' | 'empty-date-window' | 'unpushed-widened' | 'branch' | 'branch-no-base';
}

export class InvalidScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScopeError';
  }
}
