import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_TOGGLE_VIEW_MODE } from '../../../src/config/identifiers';
import { flattenTree, getSnapshot, getTree } from '../support/extensionApi';
import { ensureMultiRepoBaseline } from '../support/baseline';

describe('flat list toggle', function () {
  before(async () => {
    await ensureMultiRepoBaseline();
    await vscode.commands.executeCommand('review-surface.internal.setScope', { kind: 'last-n', commitCount: 1 });
  });

  it('toggles to flat without dropping files', async () => {
    const before = await getSnapshot();
    assert.strictEqual(before.viewMode, 'tree');
    const beforeKeys = [...before.fileKeys].sort();
    await vscode.commands.executeCommand(CMD_TOGGLE_VIEW_MODE);
    const after = await getSnapshot();
    assert.strictEqual(after.viewMode, 'flat');
    assert.deepStrictEqual([...after.fileKeys].sort(), beforeKeys);
    const tree = await getTree();
    const flat = flattenTree(tree);
    assert.ok(flat.length > 0);
    for (const node of flat) {
      assert.strictEqual(node.kind, 'file');
    }
    for (const node of flat) {
      assert.ok(node.description === 'repoA' || node.description === 'repoB');
    }
  });

  it('toggles back to tree', async () => {
    await vscode.commands.executeCommand(CMD_TOGGLE_VIEW_MODE);
    const snapshot = await getSnapshot();
    assert.strictEqual(snapshot.viewMode, 'tree');
    const tree = await getTree();
    const all = flattenTree(tree);
    assert.ok(all.some((node) => node.kind === 'directory' || node.kind === 'repo'));
  });
});
