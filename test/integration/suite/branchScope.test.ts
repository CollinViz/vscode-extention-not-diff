import * as assert from 'node:assert';
import * as vscode from 'vscode';
import {
  checkoutNewBranch,
  clearUpstream,
  git,
  resetHard,
  setUpstreamAt,
  writeAndCommit,
  writeDirty,
  writeFile
} from '../support/gitFixture';
import { getSnapshot, keyFor, setScope, waitForFileKeys } from '../support/extensionApi';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

describe('branch scope', function () {
  let repoA = '';
  let repoB = '';

  before(async () => {
    ({ repoA, repoB } = repoRoots());
    // repoA: master line + one local feature commit, with origin/master tracking the base.
    const firstA = git(repoA, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0] ?? 'HEAD';
    git(repoA, ['reset', '--hard', firstA]);
    git(repoA, ['clean', '-fd']);
    resetHard(repoA);
    clearUpstream(repoA);
    git(repoA, ['checkout', '-B', 'master']);
    writeAndCommit(repoA, 'app/core.ts', 'export const core = 1;\n', 'base core');
    const masterSha = git(repoA, ['rev-parse', 'HEAD']).trim();
    checkoutNewBranch(repoA, 'feature/AKILI-559');
    writeAndCommit(repoA, 'app/core.ts', 'export const core = 2;\n', 'feature core');
    writeFile(repoA, 'app/new.ts', 'export const added = 1;\n');
    git(repoA, ['add', 'app/new.ts']);
    git(repoA, ['commit', '-m', 'feature new file']);
    writeDirty(repoA, 'app/notes.ts', 'untracked\n');
    setUpstreamAt(repoA, masterSha);

    // repoB: single clean commit on its only branch, no remotes at all.
    const firstB = git(repoB, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0] ?? 'HEAD';
    git(repoB, ['reset', '--hard', firstB]);
    git(repoB, ['clean', '-fd']);
    resetHard(repoB);
    clearUpstream(repoB);
    git(repoB, ['checkout', '-B', 'master']);
    writeAndCommit(repoB, 'src/only.ts', 'export const only = 1;\n', 'only commit');

    await setScope({ kind: 'branch' });
    await waitForFileKeys([
      keyFor(repoA, 'app/core.ts'),
      keyFor(repoA, 'app/new.ts'),
      keyFor(repoA, 'app/notes.ts')
    ]);
  });

  it('lists only branch-local changes', async () => {
    const snapshot = await getSnapshot();
    assert.strictEqual(snapshot.scopeLabel, 'Current branch');
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'app/core.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'app/new.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'app/notes.ts')));
  });

  it('hides repos with no divergence from their base branch', async () => {
    const snapshot = await getSnapshot();
    assert.ok(!snapshot.fileKeys.some((key) => key.startsWith(`${repoB}::`)), `repoB leaked: ${snapshot.fileKeys.join(',')}`);
  });
});
