import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_DISABLE_DIM_UNCHANGED, CMD_ENABLE_DIM_UNCHANGED, CMD_OPEN_FILE } from '../../../src/config/identifiers';
import { getSnapshot } from '../support/extensionApi';
import { ensureMultiRepoBaseline } from '../support/baseline';

describe('dim unchanged lines', function () {
  before(async () => {
    await ensureMultiRepoBaseline();
  });

  after(async () => {
    await vscode.commands.executeCommand(CMD_DISABLE_DIM_UNCHANGED);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  it('toggles the session flag without dropping change decorations', async () => {
    const snapshot = await getSnapshot();
    const target = snapshot.files.find((file) => file.relativePath === 'lib/utils/random.ts');
    assert.ok(target, `random.ts missing: ${snapshot.fileKeys.join(',')}`);
    await vscode.commands.executeCommand(CMD_OPEN_FILE, {
      repoRoot: target.repoRoot,
      repoId: target.repoId,
      relativePath: target.relativePath,
      previousPath: target.previousPath,
      baseCommit: target.baseCommit,
      kind: target.kind
    });

    let current = await getSnapshot();
    assert.strictEqual(current.dimUnchanged, false);
    const highlights = current.activeEditor?.decorationLineCount ?? 0;
    assert.ok(highlights > 0, 'expected change highlights before dimming');

    await vscode.commands.executeCommand(CMD_ENABLE_DIM_UNCHANGED);
    current = await getSnapshot();
    assert.strictEqual(current.dimUnchanged, true);
    assert.strictEqual(current.activeEditor?.decorationLineCount, highlights);

    await vscode.commands.executeCommand(CMD_DISABLE_DIM_UNCHANGED);
    current = await getSnapshot();
    assert.strictEqual(current.dimUnchanged, false);
    assert.strictEqual(current.dimmedLineCount, 0);
    assert.strictEqual(current.activeEditor?.decorationLineCount, highlights);
  });
});
