import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_OPEN_FILE, CMD_TOGGLE_EDIT_MODE } from '../../../src/config/identifiers';
import { getSnapshot, keyFor, setScope } from '../support/extensionApi';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

describe('read-only default and edit toggle', function () {
  before(async () => {
    await setScope({ kind: 'last-n', commitCount: 12 });
  });

  it('opens in read-only and toggles edit mode with decorations intact', async () => {
    const { repoA } = repoRoots();
    const snapshot = await getSnapshot();
    const target = snapshot.files.find((file) => file.relativePath === 'recent/window.ts' || file.relativePath === 'dirty/working.ts');
    assert.ok(target, `no editable target file; keys=${snapshot.fileKeys.join(',')}`);
    const args = {
      repoRoot: target.repoRoot || repoA,
      repoId: target.repoId,
      relativePath: target.relativePath,
      previousPath: target.previousPath,
      baseCommit: target.baseCommit,
      kind: target.kind
    };
    await vscode.commands.executeCommand(CMD_OPEN_FILE, args);
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor);
    assert.strictEqual(editor.document.uri.scheme, 'file');
    assert.ok(editor.document.uri.fsPath.replace(/\\/g, '/').endsWith(target.relativePath));
    const noDiffTabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => (tab.input as { modified?: unknown }).modified !== undefined);
    void noDiffTabs;
    let current = await getSnapshot();
    assert.ok(current.activeEditor);
    assert.strictEqual(current.activeEditor?.isReviewSession, true);
    assert.strictEqual(current.activeEditor?.posture, 'read-only');

    const beforeText = editor.document.getText();
    // Session read-only blocks user-typed content changes: the document must be unchanged
    // after an attempted edit while the posture is read-only.
    await editor.edit((builder) => {
      builder.insert(new vscode.Position(0, 0), 'X');
    });
    assert.strictEqual(editor.document.getText(), beforeText);

    await vscode.commands.executeCommand(CMD_TOGGLE_EDIT_MODE);
    current = await getSnapshot();
    assert.strictEqual(current.activeEditor?.posture, 'editing');

    const editAccepted = await editor.edit((builder) => {
      builder.insert(new vscode.Position(0, 0), 'SENTINEL');
    });
    assert.strictEqual(editAccepted, true);
    await editor.edit((builder) => {
      const text = editor.document.getText();
      const index = text.indexOf('SENTINEL');
      if (index >= 0) {
        builder.delete(new vscode.Range(editor.document.positionAt(index), editor.document.positionAt(index + 'SENTINEL'.length)));
      }
    });

    current = await getSnapshot();
    assert.ok((current.activeEditor?.decorationLineCount ?? 0) > 0);

    await vscode.commands.executeCommand(CMD_TOGGLE_EDIT_MODE);
    current = await getSnapshot();
    assert.strictEqual(current.activeEditor?.posture, 'read-only');
    assert.ok((current.activeEditor?.decorationLineCount ?? 0) > 0);
    void keyFor;
  });
});
