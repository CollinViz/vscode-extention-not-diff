import type { GitExecResult } from '../domain/ports';

export class GitCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitCommandError';
  }
}

export function formatGitError(repoName: string, args: readonly string[], result: GitExecResult): string {
  return `[${repoName}] git ${args.join(' ')} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`;
}

export function formatRepoError(repoName: string, message: string): string {
  return `[${repoName}] ${message}`;
}
