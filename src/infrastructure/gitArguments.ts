import {
  ARG_CACHED,
  ARG_CAT_FILE,
  ARG_DATE_ORDER,
  ARG_DIFF,
  ARG_FIND_RENAMES,
  ARG_MERGE_BASE,
  ARG_NAME_STATUS,
  ARG_NO_COLOR,
  ARG_NO_EXT_DIFF,
  ARG_NULL,
  ARG_PORCELAIN,
  ARG_PRETTY_FORMAT,
  ARG_QUIET,
  ARG_REV_LIST,
  ARG_REV_PARSE,
  ARG_STATUS,
  ARG_SYMBOLIC_REF,
  ARG_UNIFIED,
  ARG_UNTRACKED_ALL,
  ARG_VERIFY,
  GIT_HEAD,
  GIT_UPSTREAM,
  ORIGIN_HEAD_REF
} from '../config/constants';

export function revListArgs(): readonly string[] {
  return [ARG_REV_LIST, ARG_PRETTY_FORMAT, ARG_DATE_ORDER, GIT_HEAD];
}

export function upstreamRevParseArgs(): readonly string[] {
  return [ARG_REV_PARSE, ARG_VERIFY, ARG_QUIET, GIT_UPSTREAM];
}

export function headRevParseArgs(): readonly string[] {
  return [ARG_REV_PARSE, ARG_VERIFY, ARG_QUIET, GIT_HEAD];
}

export function diffNameStatusArgs(base: string): readonly string[] {
  return [ARG_DIFF, ARG_NAME_STATUS, ARG_FIND_RENAMES, ARG_NO_COLOR, base];
}

export function diffCachedNameStatusArgs(headRef: string): readonly string[] {
  return [ARG_DIFF, ARG_NAME_STATUS, ARG_FIND_RENAMES, ARG_NO_COLOR, ARG_CACHED, headRef];
}

export function diffUnifiedZeroArgs(base: string, relativePath: string): readonly string[] {
  return [ARG_DIFF, ARG_UNIFIED, ARG_NO_COLOR, ARG_NO_EXT_DIFF, base, '--', relativePath];
}

export function diffCachedUnifiedZeroArgs(relativePath: string): readonly string[] {
  return [ARG_DIFF, ARG_UNIFIED, ARG_NO_COLOR, ARG_NO_EXT_DIFF, ARG_CACHED, '--', relativePath];
}

export function statusPorcelainArgs(): readonly string[] {
  return [ARG_STATUS, ARG_PORCELAIN, ARG_NULL, ARG_UNTRACKED_ALL];
}

export function unpushedNameStatusArgs(upstream: string): readonly string[] {
  return [ARG_DIFF, ARG_NAME_STATUS, ARG_FIND_RENAMES, ARG_NO_COLOR, upstream, GIT_HEAD];
}

export function revParseBlobArgs(revAndPath: string): readonly string[] {
  return [ARG_REV_PARSE, ARG_VERIFY, ARG_QUIET, revAndPath];
}

export function mergeBaseArgs(headRef: string, baseRef: string): readonly string[] {
  return [ARG_MERGE_BASE, headRef, baseRef];
}

export function originHeadArgs(): readonly string[] {
  return [ARG_SYMBOLIC_REF, ORIGIN_HEAD_REF];
}

export function verifyRefArgs(ref: string): readonly string[] {
  return [ARG_REV_PARSE, ARG_VERIFY, ARG_QUIET, ref];
}

export function catFileBlobArgs(blobId: string): readonly string[] {
  return [ARG_CAT_FILE, 'blob', blobId];
}
