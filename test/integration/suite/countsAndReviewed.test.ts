import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_CLEAR_REVIEWED, CMD_MARK_ALL_REVIEWED, CMD_TOGGLE_REVIEWED } from '../../../src/config/identifiers';
import { flattenTree, getSnapshot, getTree, keyFor, waitFor } from '../support/extensionApi';
import { ensureMultiRepoBaseline } from '../support/baseline';

describe('per-file counts and session reviewed state', function () {
  let repoA = '';

  before(async () => {
    const baseline = await ensureMultiRepoBaseline();
    repoA = baseline.repoA;
  });

  after(async () => {
    // Reviewed state is session-global; leave it empty for later suites.
    await vscode.commands.executeCommand(CMD_CLEAR_REVIEWED);
  });

  it('reports +/− counts derived from the diff hunks', async () => {
    const tree = await getTree();
    const files = flattenTree(tree).filter((node) => node.kind === 'file');
    assert.ok(files.length > 0, 'expected file nodes');

    const random = files.find((node) => node.label === 'random.ts');
    assert.ok(random, 'missing dirty file node');
    assert.deepStrictEqual(
      { additions: random.additions, deletions: random.deletions },
      { additions: 1, deletions: 1 },
      'dirty edit must count one added and one deleted line'
    );

    for (const label of ['dashboard.tsx', 'index.ts', 'staged.ts', 'todo.ts']) {
      const node = files.find((candidate) => candidate.label === label);
      assert.ok(node, `missing file node ${label}`);
      assert.deepStrictEqual(
        { label: node.label, additions: node.additions, deletions: node.deletions },
        { label: node.label, additions: 1, deletions: 0 }
      );
    }
  });

  it('toggles one file reviewed and back, session-only', async () => {
    const key = keyFor(repoA, 'lib/utils/random.ts');
    await vscode.commands.executeCommand(CMD_TOGGLE_REVIEWED, { id: key });
    await waitFor(async () => (await getSnapshot()).reviewedKeys.includes(key));

    let tree = await getTree();
    let reviewed = flattenTree(tree).filter((node) => node.kind === 'file' && node.reviewed);
    assert.deepStrictEqual(reviewed.map((node) => node.id), [key]);

    await vscode.commands.executeCommand(CMD_TOGGLE_REVIEWED, { id: key });
    await waitFor(async () => !(await getSnapshot()).reviewedKeys.includes(key));
    tree = await getTree();
    reviewed = flattenTree(tree).filter((node) => node.kind === 'file' && node.reviewed);
    assert.deepStrictEqual(reviewed.map((node) => node.id), []);
  });

  it('marks all files reviewed and clears the session state', async () => {
    await vscode.commands.executeCommand(CMD_MARK_ALL_REVIEWED);
    await waitFor(async () => {
      const snapshot = await getSnapshot();
      return snapshot.reviewedKeys.length === snapshot.fileCount && snapshot.fileCount > 0;
    });
    const marked = await getSnapshot();
    assert.deepStrictEqual([...marked.reviewedKeys].sort(), [...marked.fileKeys].sort());

    await vscode.commands.executeCommand(CMD_CLEAR_REVIEWED);
    await waitFor(async () => (await getSnapshot()).reviewedKeys.length === 0);
    const cleared = await getSnapshot();
    assert.deepStrictEqual(cleared.reviewedKeys, []);
  });
});
