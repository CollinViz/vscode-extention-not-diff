import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function initRepo(root: string): void {
  mkdirSync(root, { recursive: true });
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Review Surface Test']);
}

export function git(root: string, args: readonly string[], env?: NodeJS.ProcessEnv): string {
  return String(execFileSync('git', [...args], { cwd: root, env: { ...process.env, ...env } }));
}

export function writeFile(root: string, relativePath: string, content: string): void {
  const full = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function writeAndCommit(root: string, relativePath: string, content: string, message: string, isoDate?: string): string {
  writeFile(root, relativePath, content);
  git(root, ['add', relativePath]);
  const env = isoDate ? { GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } : undefined;
  git(root, ['commit', '-m', message], env);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

export function commitAll(root: string, message: string, isoDate?: string): string {
  git(root, ['add', '-A']);
  const env = isoDate ? { GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } : undefined;
  git(root, ['commit', '-m', message], env);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

export function writeDirty(root: string, relativePath: string, content: string): void {
  writeFile(root, relativePath, content);
}

export function stage(root: string, relativePath: string): void {
  git(root, ['add', relativePath]);
}

export function checkoutNewBranch(root: string, name: string): void {
  git(root, ['checkout', '-b', name]);
}

export function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD']).trim();
}

export function showFileAt(root: string, rev: string, relativePath: string): string {
  try {
    return String(execFileSync('git', ['show', `${rev}:${relativePath}`], { cwd: root }));
  } catch {
    return '';
  }
}

export function setUpstreamAt(root: string, sha: string): void {
  git(root, ['update-ref', 'refs/remotes/origin/main', sha]);
  git(root, ['config', 'branch.main.remote', 'origin']);
  git(root, ['config', 'branch.main.merge', 'refs/heads/main']);
  git(root, ['config', 'remote.origin.url', './']);
  git(root, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
}

export function clearUpstream(root: string): void {
  for (const key of ['branch.main.remote', 'branch.main.merge', 'remote.origin.url', 'remote.origin.fetch']) {
    try {
      git(root, ['config', '--unset', key]);
    } catch {
      // no such key configured
    }
  }
  try {
    git(root, ['update-ref', '-d', 'refs/remotes/origin/main']);
  } catch {
    // no ref to delete
  }
}

export function resetHard(root: string, ref = 'HEAD'): void {
  git(root, ['reset', '--hard', ref]);
  git(root, ['clean', '-fd']);
}
