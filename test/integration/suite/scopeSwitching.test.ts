import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { clearUpstream, commitAll, git, resetHard, setUpstreamAt, stage, writeAndCommit, writeDirty } from '../support/gitFixture';
import { getSnapshot, keyFor, setScope, waitFor, waitForFileKeys } from '../support/extensionApi';
import { formatScopeLabel } from '../../../src/application/ReviewCoordinator';
import { expandDatePreset } from '../../../src/domain/ScopeBaseResolver';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('scope switching', function () {
  let repoA = '';
  let repoB = '';
  let rootSha = '';

  before(async () => {
    ({ repoA, repoB } = repoRoots());
    const first = git(repoA, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0] ?? 'HEAD';
    git(repoA, ['reset', '--hard', first]);
    git(repoA, ['clean', '-fd']);
    resetHard(repoA);
    clearUpstream(repoA);
    // Re-date the skeleton root commit so date windows can exclude it; otherwise every
    // window covering "now" would match the root and fall back to the empty tree.
    const rootDate = new Date(Date.now() - 45 * DAY_MS).toISOString();
    git(repoA, ['commit', '--amend', '--no-edit', '--date', rootDate], { GIT_COMMITTER_DATE: rootDate });
    rootSha = git(repoA, ['rev-parse', 'HEAD']).trim();
    const now = Date.now();
    const oldDate = (offsetDays: number): string => new Date(now - offsetDays * DAY_MS).toISOString();
    writeAndCommit(repoA, 'ancient/file1.ts', 'export const a1 = 1;\n', 'ancient 1', oldDate(30));
    writeAndCommit(repoA, 'ancient/file2.ts', 'export const a2 = 1;\n', 'ancient 2', oldDate(30));
    for (let i = 3; i <= 11; i += 1) {
      writeAndCommit(repoA, 'recent/window.ts', `export const w = ${i};\n`, `recent ${i}`, oldDate(1));
    }
    writeAndCommit(repoA, 'recent/window.ts', 'export const w = 12;\n', 'recent 12', oldDate(0));
    writeDirty(repoA, 'dirty/working.ts', 'working\n');
    writeDirty(repoA, 'dirty/staged.ts', 'staged\n');
    stage(repoA, 'dirty/staged.ts');
    writeDirty(repoA, 'dirty/untracked.ts', 'untracked\n');
    commitAll(repoB, 'quiet repoB');
  });

  it('excludes old untouched commits with default N and no unpushed', async () => {
    const head = git(repoA, ['rev-parse', 'HEAD']).trim();
    setUpstreamAt(repoA, head);
    await setScope({ kind: 'last-n', commitCount: 10 });
    await waitFor(async () => {
      const current = await getSnapshot();
      return !current.fileKeys.includes(keyFor(repoA, 'ancient/file1.ts'));
    });
    const latest = await getSnapshot();
    assert.ok(latest.fileKeys.includes(keyFor(repoA, 'recent/window.ts')));
    assert.ok(latest.fileKeys.includes(keyFor(repoA, 'dirty/working.ts')));
    assert.ok(latest.fileKeys.includes(keyFor(repoA, 'dirty/untracked.ts')));
    // Fewer-than-N repo: repoB history is short, so its tracked files are still listed.
    assert.ok(latest.fileKeys.includes(keyFor(repoB, 'src/index.ts')));
  });

  it('includes unpushed commits beyond N via widening', async () => {
    setUpstreamAt(repoA, rootSha);
    await setScope({ kind: 'last-n', commitCount: 10 });
    await waitFor(async () => {
      const current = await getSnapshot();
      return current.fileKeys.includes(keyFor(repoA, 'ancient/file1.ts'));
    });
    const snapshot = await getSnapshot();
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'ancient/file1.ts')));
  });

  it('includes ancient files when N covers history', async () => {
    const head = git(repoA, ['rev-parse', 'HEAD']).trim();
    setUpstreamAt(repoA, head);
    await setScope({ kind: 'last-n', commitCount: 12 });
    await waitFor(async () => {
      const current = await getSnapshot();
      return current.fileKeys.includes(keyFor(repoA, 'ancient/file1.ts'));
    });
  });

  it('filters by custom date range while keeping dirty files', async () => {
    const head = git(repoA, ['rev-parse', 'HEAD']).trim();
    setUpstreamAt(repoA, head);
    const now = new Date();
    const since = new Date(now.getTime() - 2 * DAY_MS).toISOString();
    const until = now.toISOString();
    await setScope({ kind: 'date-range', since, until, presetId: 'custom' });
    await waitFor(async () => {
      const current = await getSnapshot();
      return current.fileKeys.includes(keyFor(repoA, 'recent/window.ts'));
    });
    const snapshot = await getSnapshot();
    assert.ok(!snapshot.fileKeys.includes(keyFor(repoA, 'ancient/file1.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'dirty/working.ts')));
  });

  it('falls back to HEAD on empty date windows but keeps dirty files', async () => {
    // A window with no commits at all: root is 45 days old, ancient commits 30 days
    // old, recent commits within the last day.
    const now = Date.now();
    const since = new Date(now - 25 * DAY_MS).toISOString();
    const until = new Date(now - 20 * DAY_MS).toISOString();
    await setScope({ kind: 'date-range', since, until, presetId: 'custom' });
    await waitFor(async () => {
      const current = await getSnapshot();
      return current.fileKeys.includes(keyFor(repoA, 'dirty/working.ts'));
    });
    const snapshot = await getSnapshot();
    assert.ok(!snapshot.fileKeys.includes(keyFor(repoA, 'recent/window.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'dirty/working.ts')));
    assert.ok(snapshot.fileKeys.includes(keyFor(repoA, 'dirty/untracked.ts')));
  });

  it('matches scope labels from presets', async () => {
    const now = new Date();
    for (const presetId of ['last-24-hours', 'last-3-days', 'last-week'] as const) {
      const { since, until } = expandDatePreset(presetId, now);
      const expectedLabel = formatScopeLabel({ kind: 'date-range', since, until, presetId });
      await setScope({ kind: 'date-range', since, until, presetId });
      const snapshot = await getSnapshot();
      assert.strictEqual(snapshot.scopeLabel, expectedLabel);
    }
    await setScope({ kind: 'last-n', commitCount: 10 });
    await waitForFileKeys((await getSnapshot()).fileKeys);
  });
});
