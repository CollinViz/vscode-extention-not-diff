import { execFile } from 'node:child_process';
import { GIT_COMMAND, GIT_EXEC_TIMEOUT_MS, MAX_GIT_BUFFER_BYTES } from '../config/constants';
import type { GitExecResult, IGitExecutor } from '../domain/ports';
import { GitCommandError } from '../util/errors';

export class GitCliExecutor implements IGitExecutor {
  async exec(repoRoot: string, args: readonly string[]): Promise<GitExecResult> {
    return new Promise<GitExecResult>((resolve, reject) => {
      execFile(
        GIT_COMMAND,
        [...args],
        { cwd: repoRoot, windowsHide: true, maxBuffer: MAX_GIT_BUFFER_BYTES, timeout: GIT_EXEC_TIMEOUT_MS },
        (error, stdout, stderr) => {
          if (error && isSpawnFailure(error)) {
            reject(new GitCommandError(`Unable to run git in ${repoRoot}: ${(error as Error).message}`));
            return;
          }
          const exitCode = typeof (error as { code?: unknown } | null)?.code === 'number'
            ? ((error as { code: number }).code)
            : 0;
          resolve({ stdout: String(stdout), stderr: String(stderr), exitCode });
        }
      );
    });
  }
}

function isSpawnFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'EACCES';
}
