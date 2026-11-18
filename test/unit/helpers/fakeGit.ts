import type { IClock, IGitExecutor, GitExecResult } from '../../../src/domain/ports';

export class FakeClock implements IClock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(date: Date): void {
    this.current = date;
  }
}

export class FakeGitExecutor implements IGitExecutor {
  private readonly responses = new Map<string, GitExecResult>();

  set(args: readonly string[], result: GitExecResult): void {
    this.responses.set(args.join('\0'), result);
  }

  async exec(_repoRoot: string, args: readonly string[]): Promise<GitExecResult> {
    const found = this.responses.get(args.join('\0'));
    if (found) {
      return found;
    }
    return { stdout: '', stderr: '', exitCode: 1 };
  }
}

export function ok(stdout: string): GitExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}

export function fail(stderr = 'error'): GitExecResult {
  return { stdout: '', stderr, exitCode: 1 };
}
