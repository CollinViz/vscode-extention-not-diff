import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_NEXT_CHANGE, CMD_OPEN_FILE, CMD_PREV_CHANGE } from '../../../src/config/identifiers';
import { getSnapshot, setScope } from '../support/extensionApi';
import { git, resetHard, writeAndCommit, writeDirty } from '../support/gitFixture';

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

describe('change navigation', function () {
  before(async () => {
    const { repoA } = repoRoots();
    const first = git(repoA, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0] ?? 'HEAD';
    git(repoA, ['reset', '--hard', first]);
    git(repoA, ['clean', '-fd']);
    resetHard(repoA);
    const lines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n') + '\n';
    writeAndCommit(repoA, 'nav/lines.txt', lines, 'nav base');
    writeAndCommit(repoA, 'nav/other.txt', 'other\n', 'nav other');
    const edited = lines.split('\n').map((line, index) => (index === 2 || index === 7 ? `${line} edited` : line)).join('\n');
    writeDirty(repoA, 'nav/lines.txt', edited);
    await setScope({ kind: 'last-n', commitCount: 1 });
  });

  it('jumps to the change nearest the cursor and wraps around', async () => {
    const snapshot = await getSnapshot();
    const target = snapshot.files.find((file) => file.relativePath === 'nav/lines.txt');
    assert.ok(target, `nav target missing: ${snapshot.fileKeys.join(',')}`);
    await vscode.commands.executeCommand(CMD_OPEN_FILE, {
      repoRoot: target.repoRoot,
      repoId: target.repoId,
      relativePath: target.relativePath,
      previousPath: target.previousPath,
      baseCommit: target.baseCommit,
      kind: target.kind
    });
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor);
    const setCursor = (line: number): void => {
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
    };
    const cursorLine = (): number => vscode.window.activeTextEditor?.selection.active.line ?? -1;

    setCursor(0);
    await vscode.commands.executeCommand(CMD_NEXT_CHANGE);
    assert.strictEqual(cursorLine(), 2);
    await vscode.commands.executeCommand(CMD_NEXT_CHANGE);
    assert.strictEqual(cursorLine(), 7);
    await vscode.commands.executeCommand(CMD_NEXT_CHANGE);
    assert.strictEqual(cursorLine(), 2);
    await vscode.commands.executeCommand(CMD_PREV_CHANGE);
    assert.strictEqual(cursorLine(), 7);
    await vscode.commands.executeCommand(CMD_PREV_CHANGE);
    assert.strictEqual(cursorLine(), 2);
  });
});
