import { basenamePosix, toPosixPath } from '../util/paths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export async function openDiffVsBase(
  vscode: VscodeLike,
  encodeBaseUri: (parts: { repoRoot: string; baseCommit: string; gitPath: string }) => string,
  findFileForEditor: () => { repoRoot: string; baseCommit: string; relativePath: string; previousPath: string | null } | null,
  explicit?: { repoRoot: string; baseCommit: string; relativePath: string; previousPath: string | null }
): Promise<void> {
  const target = explicit ?? findFileForEditor();
  if (!target) {
    await vscode.window.showWarningMessage('No review file is active.');
    return;
  }
  const gitPath = target.previousPath ?? target.relativePath;
  const left = vscode.Uri.parse(encodeBaseUri({ repoRoot: target.repoRoot, baseCommit: target.baseCommit, gitPath }));
  const { join } = await import('node:path');
  const right = vscode.Uri.file(join(target.repoRoot, ...toPosixPath(target.relativePath).split('/')));
  const title = `${basenamePosix(target.relativePath)} (Base ↔ Current)`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title);
}
