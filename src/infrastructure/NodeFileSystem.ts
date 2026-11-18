import { access, readFile } from 'node:fs/promises';
import type { IFileSystem } from '../domain/ports';

export class NodeFileSystem implements IFileSystem {
  async exists(absolutePath: string): Promise<boolean> {
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async readTextFile(absolutePath: string): Promise<string> {
    return readFile(absolutePath, 'utf8');
  }
}
