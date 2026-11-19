import type { ReviewScope, ViewMode } from '../domain/models';
import type { IReviewStateStore } from '../domain/ports';
import { defaultReviewScope, defaultViewMode } from '../config/defaults';

export class MemoryReviewStateStore implements IReviewStateStore {
  private scope: ReviewScope = defaultReviewScope();
  private viewMode: ViewMode = defaultViewMode();
  private readonly reviewedKeys = new Set<string>();

  getScope(): ReviewScope {
    return this.scope;
  }

  setScope(scope: ReviewScope): void {
    this.scope = scope;
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  getReviewedKeys(): ReadonlySet<string> {
    return this.reviewedKeys;
  }

  markReviewed(key: string): void {
    this.reviewedKeys.add(key);
  }

  unmarkReviewed(key: string): void {
    this.reviewedKeys.delete(key);
  }

  clearReviewed(): void {
    this.reviewedKeys.clear();
  }
}
