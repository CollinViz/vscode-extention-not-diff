import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { GIT_API_VERSION, MAX_REPO_SCAN_DEPTH } from '../config/constants';
import type { RepositoryDescriptor } from '../domain/models';
import type { IRepositoryDiscovery } from '../domain/ports';
import { basenamePosix, toPosixPath } from '../util/paths';

const IGNORED_SCAN_DIR_NAMES = new Set(['node_modules', '.git', 'out-test', 'dist']);
const GIT_DIR_NAME = '.git';

interface GitApiRepository {
  readonly rootUri?: { readonly fsPath?: string; readonly path?: string };
  readonly state?: { readonly HEAD?: { readonly upstream?: { readonly name?: string } | null } | null };
}

interface GitApi {
  readonly repositories?: readonly GitApiRepository[];
  readonly onDidOpenRepository?: (listener: () => void) => { dispose(): void };
  readonly onDidCloseRepository?: (listener: () => void) => unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VscodeLike = any;

export class WorkspaceRepoLocator implements IRepositoryDiscovery {
  constructor(private readonly vscodeApi: VscodeLike) {}

  onDidChangeRepositories(listener: () => void): { dispose(): void } {
    const api = this.tryGetApi();
    const disposables: { dispose(): void }[] = [];
    if (api?.onDidOpenRepository) {
      disposables.push(api.onDidOpenRepository(listener));
    }
    if (api?.onDidCloseRepository) {
      const result = api.onDidCloseRepository(listener) as unknown;
      if (result && typeof (result as { dispose?: unknown }).dispose === 'function') {
        disposables.push(result as { dispose(): void });
      }
    }
    return { dispose: () => { for (const d of disposables) { d.dispose(); } } };
  }

  async discover(): Promise<readonly RepositoryDescriptor[]> {
    const found = new Map<string, RepositoryDescriptor>();
    for (const repo of this.reposFromGitApi()) {
      found.set(repo.id, repo);
    }
    for (const repo of await this.reposFromWorkspaceScan()) {
      if (!found.has(repo.id)) {
        found.set(repo.id, repo);
      }
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private tryGetApi(): GitApi | null {
    try {
      const gitExtension = this.vscodeApi?.extensions?.getExtension?.('vscode.git');
      const exportsOf = gitExtension?.exports;
      if (exportsOf?.getAPI) {
        return exportsOf.getAPI(GIT_API_VERSION) as GitApi;
      }
      return null;
    } catch {
      return null;
    }
  }

  private reposFromGitApi(): RepositoryDescriptor[] {
    const api = this.tryGetApi();
    const repos = api?.repositories ?? [];
    const results: RepositoryDescriptor[] = [];
    for (const repo of repos) {
      const fsPath = repo.rootUri?.fsPath ?? repo.rootUri?.path;
      if (!fsPath) {
        continue;
      }
      results.push({
        id: fsPath,
        name: basenamePosix(toPosixPath(fsPath)),
        rootPath: fsPath,
        hasHead: true,
        upstreamRef: repo.state?.HEAD?.upstream?.name ?? null
      });
    }
    return results;
  }

  private async reposFromWorkspaceScan(): Promise<RepositoryDescriptor[]> {
    const folders: readonly { uri: { fsPath: string } }[] = this.vscodeApi?.workspace?.workspaceFolders ?? [];
    const results: RepositoryDescriptor[] = [];
    const seen = new Set<string>();
    for (const folder of folders) {
      const root = folder.uri.fsPath;
      await this.scanForRepos(root, 0, results, seen);
    }
    return results;
  }

  private async scanForRepos(dir: string, depth: number, out: RepositoryDescriptor[], seen: Set<string>): Promise<void> {
    if (depth > MAX_REPO_SCAN_DEPTH) {
      return;
    }
    const gitPath = join(dir, GIT_DIR_NAME);
    if (await this.isGitDir(gitPath)) {
      const real = await this.safeRealpath(dir);
      if (!seen.has(real)) {
        seen.add(real);
        out.push({
          id: dir,
          name: basenamePosix(toPosixPath(dir)),
          rootPath: dir,
          hasHead: true,
          upstreamRef: null
        });
      }
      return;
    }
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_SCAN_DIR_NAMES.has(entry)) {
        continue;
      }
      if (entry.startsWith('.') && entry !== GIT_DIR_NAME) {
        continue;
      }
      const full = join(dir, entry);
      let entryStat;
      try {
        entryStat = await stat(full);
      } catch {
        continue;
      }
      if (!entryStat.isDirectory()) {
        continue;
      }
      await this.scanForRepos(full, depth + 1, out, seen);
    }
  }

  private async isGitDir(gitPath: string): Promise<boolean> {
    try {
      const entryStat = await stat(gitPath);
      return entryStat.isDirectory() || entryStat.isFile();
    } catch {
      return false;
    }
  }

  private async safeRealpath(value: string): Promise<string> {
    try {
      return await realpath(value);
    } catch {
      return value;
    }
  }
}
