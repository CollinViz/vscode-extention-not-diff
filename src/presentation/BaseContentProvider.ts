import type { IGitExecutor } from '../domain/ports';
import { catFileBlobArgs, revParseBlobArgs } from '../infrastructure/gitArguments';
import { decodeBaseUri } from '../util/reviewUri';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export class BaseContentProvider {
  private readonly changeEmitter: VscodeLike;
  readonly onDidChange: VscodeLike;

  constructor(private readonly vscode: VscodeLike, private readonly git: IGitExecutor) {
    this.changeEmitter = new vscode.EventEmitter();
    this.onDidChange = this.changeEmitter.event;
  }

  notifyChanged(): void {
    this.changeEmitter.fire(undefined);
  }

  async provideTextDocumentContent(uri: VscodeLike): Promise<string> {
    const parts = decodeBaseUri(uri.toString());
    if (parts.repoRoot === '' || parts.baseCommit === '' || parts.gitPath === '') {
      return '';
    }
    const revSpec = `${parts.baseCommit}:${parts.gitPath}`;
    const blob = await this.git.exec(parts.repoRoot, revParseBlobArgs(revSpec));
    if (blob.exitCode !== 0) {
      return '';
    }
    const blobId = blob.stdout.trim().split('\n')[0]?.trim() ?? '';
    if (blobId === '') {
      return '';
    }
    const content = await this.git.exec(parts.repoRoot, catFileBlobArgs(blobId));
    if (content.exitCode !== 0) {
      return '';
    }
    return content.stdout;
  }
}
