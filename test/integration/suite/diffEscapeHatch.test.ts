import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_OPEN_DIFF, CMD_OPEN_FILE, SCHEME_BASE } from '../../../src/config/identifiers';
import { getSnapshot, setScope } from '../support/extensionApi';
import { showFileAt, writeDirty } from '../support/gitFixture';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

describe('diff escape hatch', function () {
  before(async () => {
    // Dirty-modify a file that exists at the scope base so the base side is non-empty.
    const { repoA } = repoRoots();
    writeDirty(repoA, 'README.md', '# repoA\n\nlocal readme edit\n');
    await setScope({ kind: 'last-n', commitCount: 12 });
  });

  it('opens a diff tab comparing base content to the working file', async () => {
    const snapshot = await getSnapshot();
    const target = snapshot.files.find((file) => file.relativePath === 'README.md')
      ?? snapshot.files.find((file) => file.relativePath === 'recent/window.ts' || file.relativePath === 'dirty/working.ts');
    assert.ok(target, 'no diff target file');
    await vscode.commands.executeCommand(CMD_OPEN_FILE, {
      repoRoot: target.repoRoot,
      repoId: target.repoId,
      relativePath: target.relativePath,
      previousPath: target.previousPath,
      baseCommit: target.baseCommit,
      kind: target.kind
    });
    await vscode.commands.executeCommand(CMD_OPEN_DIFF);
    let diffTab: vscode.Tab | undefined;
    const start = Date.now();
    while (Date.now() - start < 20000) {
      const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
      diffTab = tabs.find((tab) => (tab.input as vscode.TabInputTextDiff | undefined) instanceof vscode.TabInputTextDiff);
      if (diffTab) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(diffTab, 'expected a diff tab');
    const input = diffTab.input as vscode.TabInputTextDiff;
    assert.strictEqual(input.original.scheme, SCHEME_BASE);
    assert.strictEqual(input.modified.scheme, 'file');
    const baseDocument = await vscode.workspace.openTextDocument(input.original);
    const expectedBase = showFileAt(target.repoRoot, target.baseCommit, target.relativePath);
    assert.strictEqual(baseDocument.getText(), expectedBase);
    if (target.relativePath === 'README.md') {
      assert.ok(baseDocument.getText().length > 0, 'base side must not be blank for a modified tracked file');
      assert.notStrictEqual(baseDocument.getText(), await vscode.workspace.openTextDocument(input.modified).then((doc) => doc.getText()));
    }
    await vscode.window.tabGroups.close(diffTab);
  });
});
