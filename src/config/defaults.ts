import type { ReviewScope, ViewMode } from '../domain/models';

export function defaultReviewScope(): ReviewScope {
  return { kind: 'branch' };
}

export function defaultViewMode(): ViewMode {
  return 'tree';
}
