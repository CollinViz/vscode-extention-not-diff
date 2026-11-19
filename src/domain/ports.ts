import type { ChangedFile, RepositoryDescriptor, ReviewScope, ViewMode, FileTreeNode } from './models';

export interface GitExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface IGitExecutor {
  exec(repoRoot: string, args: readonly string[]): Promise<GitExecResult>;
}

export interface IRepositoryDiscovery {
  discover(): Promise<readonly RepositoryDescriptor[]>;
}

export interface IClock {
  now(): Date;
}

export interface IFileSystem {
  exists(absolutePath: string): Promise<boolean>;
  readTextFile(absolutePath: string): Promise<string>;
}

export interface IReadOnlyAdapter {
  setSessionReadOnly(readOnly: boolean): Promise<void>;
}

export interface IReviewStateStore {
  getScope(): ReviewScope;
  setScope(scope: ReviewScope): void;
  getViewMode(): ViewMode;
  setViewMode(mode: ViewMode): void;
  /** Session-only reviewed keys (`repoId::relativePath`). Never persisted. */
  getReviewedKeys(): ReadonlySet<string>;
  markReviewed(key: string): void;
  unmarkReviewed(key: string): void;
  clearReviewed(): void;
}

export interface IChangeCollector {
  collect(repos: readonly RepositoryDescriptor[], scope: ReviewScope): Promise<{ files: readonly ChangedFile[]; errors: readonly string[] }>;
}

export interface ReviewSnapshot {
  readonly scope: ReviewScope;
  readonly scopeLabel: string;
  readonly viewMode: ViewMode;
  readonly files: readonly ChangedFile[];
  readonly tree: readonly FileTreeNode[];
  readonly errors: readonly string[];
}

export interface ReviewListener {
  onSnapshot(snapshot: ReviewSnapshot): void;
}
