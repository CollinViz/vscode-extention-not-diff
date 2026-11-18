import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { clearUpstream, git, resetHard, stage, writeAndCommit, writeDirty, writeFile } from './gitFixture';
import { keyFor, setScope, waitForFileKeys } from './extensionApi';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  assert.ok(folders.length >= 2, 'expected two workspace folders');
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  const repoA = paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '';
  const repoB = paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? '';
  return { repoA, repoB };
}

export async function ensureMultiRepoBaseline(): Promise<{ repoA: string; repoB: string; expected: string[] }> {
  const { repoA, repoB } = repoRoots();
  const firstA = git(repoA, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0]?.trim() ?? 'HEAD';
  git(repoA, ['reset', '--hard', firstA]);
  git(repoA, ['clean', '-fd']);
  resetHard(repoA);
  const firstB = git(repoB, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0]?.trim() ?? 'HEAD';
  git(repoB, ['reset', '--hard', firstB]);
  git(repoB, ['clean', '-fd']);
  resetHard(repoB);
  clearUpstream(repoA);
  clearUpstream(repoB);

  writeAndCommit(repoA, 'lib/untouched/skip.ts', 'export const skip = 1;\n', 'old untouched');
  writeAndCommit(repoA, 'other/nope.ts', 'export const nope = 1;\n', 'old other');
  writeAndCommit(repoA, 'lib/utils/random.ts', 'export const random = 1;\n', 'add random');
  writeAndCommit(repoA, 'views/dashboard.tsx', 'export const dashboard = 1;\n', 'add dashboard');
  writeDirty(repoA, 'lib/utils/random.ts', 'export const random = 2;\n');

  writeAndCommit(repoB, 'src/index.ts', 'export const index = 1;\n', 'add index');
  writeFile(repoB, 'src/staged.ts', 'export const staged = 1;\n');
  stage(repoB, 'src/staged.ts');
  writeDirty(repoB, 'notes/todo.ts', 'todo\n');

  await setScope({ kind: 'last-n', commitCount: 1 });
  const expected = [
    keyFor(repoA, 'lib/utils/random.ts'),
    keyFor(repoA, 'views/dashboard.tsx'),
    keyFor(repoB, 'src/index.ts'),
    keyFor(repoB, 'src/staged.ts'),
    keyFor(repoB, 'notes/todo.ts')
  ];
  await waitForFileKeys(expected);
  return { repoA, repoB, expected };
}
