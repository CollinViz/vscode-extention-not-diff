import { SCHEME_BASE } from '../config/identifiers';
import { toPosixPath } from './paths';

export interface BaseUriParts {
  readonly repoRoot: string;
  readonly baseCommit: string;
  readonly gitPath: string;
}

interface BaseUriPayload {
  readonly repoRoot: string;
  readonly baseCommit: string;
  readonly gitPath: string;
}

function encodePayload(parts: BaseUriParts): string {
  const payload: BaseUriPayload = {
    repoRoot: parts.repoRoot,
    baseCommit: parts.baseCommit,
    gitPath: toPosixPath(parts.gitPath)
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(segment: string): BaseUriParts | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<BaseUriPayload>;
    if (typeof parsed.repoRoot !== 'string' || typeof parsed.baseCommit !== 'string' || typeof parsed.gitPath !== 'string') {
      return null;
    }
    return { repoRoot: parsed.repoRoot, baseCommit: parsed.baseCommit, gitPath: toPosixPath(parsed.gitPath) };
  } catch {
    return null;
  }
}

function decodeLegacyQuery(uri: string): BaseUriParts | null {
  const queryIndex = uri.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }
  try {
    const params = new URLSearchParams(uri.slice(queryIndex + 1));
    const repoRoot = params.get('repoRoot') ?? '';
    const baseCommit = params.get('base') ?? '';
    const gitPath = params.get('path') ?? '';
    if (repoRoot === '' || baseCommit === '' || gitPath === '') {
      return null;
    }
    return { repoRoot, baseCommit, gitPath: toPosixPath(gitPath) };
  } catch {
    return null;
  }
}

export function encodeBaseUri(parts: BaseUriParts): string {
  return `${SCHEME_BASE}:${encodePayload(parts)}`;
}

export function decodeBaseUri(uri: string): BaseUriParts {
  const prefix = `${SCHEME_BASE}:`;
  const empty: BaseUriParts = { repoRoot: '', baseCommit: '', gitPath: '' };
  if (!uri.startsWith(prefix)) {
    return empty;
  }
  const rest = uri.slice(prefix.length);
  const segment = rest.includes('?') ? rest.slice(0, rest.indexOf('?')) : rest;
  const decoded = segment === '' ? null : decodePayload(segment);
  if (decoded) {
    return decoded;
  }
  return decodeLegacyQuery(uri) ?? empty;
}
