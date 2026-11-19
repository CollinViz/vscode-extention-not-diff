import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { CMD_DISABLE_FOCUS_MODE, CMD_ENABLE_FOCUS_MODE, CMD_OPEN_FILE } from '../../../src/config/identifiers';
import { getSnapshot, setScope, waitFor } from '../support/extensionApi';
import { clearUpstream, git, writeAndCommit, writeDirty } from '../support/gitFixture';

const BIG_FILE_LINES = 40;
const EDIT_FROM_INDEX = 10;
const EDIT_LINES = 3;

function repoRoots(): { repoA: string; repoB: string } {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const paths = [...folders].map((folder) => folder.uri.fsPath);
  return {
    repoA: paths.find((p) => p.endsWith('repoA')) ?? paths[0] ?? '',
    repoB: paths.find((p) => p.endsWith('repoB')) ?? paths[1] ?? ''
  };
}

function resetToRoot(repo: string): void {
  const root = git(repo, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0] ?? 'HEAD';
  git(repo, ['reset', '--hard', root]);
  git(repo, ['clean', '-fd']);
  clearUpstream(repo);
}

function bigFileContent(version: number): string {
  const lines: string[] = [];
  for (let index = 0; index < BIG_FILE_LINES; index += 1) {
    const edited = index >= EDIT_FROM_INDEX && index < EDIT_FROM_INDEX + EDIT_LINES;
    lines.push(`export const big${index} = ${edited ? version : 1};`);
  }
  return `${lines.join('\n')}\n`;
}

describe('focus mode (laser focus on changed lines)', function () {
  let repoA = '';

  before(async () => {
    const roots = repoRoots();
    repoA = roots.repoA;
    // A committed 40-line file whose middle was dirty-edited: with last-n = 1
    // (base = the commit that added it) only the middle chunk is changed, so
    // focus mode must fold head and tail around the edit. Both repos are
    // reset so the expected file-key set is exactly this fixture.
    resetToRoot(roots.repoA);
    resetToRoot(roots.repoB);
    writeAndCommit(repoA, 'focus/big.js', bigFileContent(1), 'add big file');
    writeAndCommit(repoA, 'nav-anchor.txt', 'anchor\n', 'anchor commit');
    writeDirty(repoA, 'focus/big.js', bigFileContent(2));
    await setScope({ kind: 'last-n', commitCount: 1 });
    await waitFor(async () => {
      const state = await getSnapshot();
      return state.files.some((file) => file.repoId === repoA && file.relativePath === 'focus/big.js');
    });
  });

  after(async () => {
    await vscode.commands.executeCommand(CMD_DISABLE_FOCUS_MODE);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  it('focuses the changed lines and unfolds again', async () => {
    const snapshot = await getSnapshot();
    const target = snapshot.files.find((file) => file.relativePath === 'focus/big.js');
    assert.ok(target, `big.js missing: ${snapshot.fileKeys.join(',')}`);
    await vscode.commands.executeCommand(CMD_OPEN_FILE, {
      repoRoot: target.repoRoot,
      repoId: target.repoId,
      relativePath: target.relativePath,
      previousPath: target.previousPath,
      baseCommit: target.baseCommit,
      kind: target.kind
    });
    let current = await getSnapshot();
    assert.strictEqual(current.focus.enabled, false);
    assert.strictEqual(current.focus.activeEditorFoldCount, 0);
    assert.ok((current.activeEditor?.decorationLineCount ?? 0) > 0, 'expected change highlights before focusing');

    await vscode.commands.executeCommand(CMD_ENABLE_FOCUS_MODE);
    await waitFor(async () => {
      const state = await getSnapshot();
      return state.focus.enabled && state.focus.activeEditorFoldCount === 2;
    });
    current = await getSnapshot();
    // 40-line file, 3 changed lines at 10..13 (0-based), 3 context lines:
    // head gap [0..7) and tail gap [16..40) are the only fold regions.
    assert.deepStrictEqual(current.focus, { enabled: true, contextLines: 3, activeEditorFoldCount: 2 });
    assert.ok((current.activeEditor?.decorationLineCount ?? 0) > 0, 'focus must keep the change highlights');

    await vscode.commands.executeCommand(CMD_DISABLE_FOCUS_MODE);
    await waitFor(async () => !(await getSnapshot()).focus.enabled);
    current = await getSnapshot();
    assert.strictEqual(current.focus.activeEditorFoldCount, 0);
  });
});
