import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';
import { initRepo, writeAndCommit } from './support/gitFixture';

async function main(): Promise<void> {
  process.env['REVIEW_SURFACE_TEST'] = '1';
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'review-surface-'));
  const repoA = path.join(tempRoot, 'repoA');
  const repoB = path.join(tempRoot, 'repoB');
  try {
    initRepo(repoA);
    writeAndCommit(repoA, 'README.md', '# repoA\n', 'init repoA');
    initRepo(repoB);
    writeAndCommit(repoB, 'README.md', '# repoB\n', 'init repoB');
    const workspaceFile = path.join(tempRoot, 'review-surface.code-workspace');
    fs.writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: repoA }, { path: repoB }], settings: {} }));
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'index.js');
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspaceFile, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes']
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
