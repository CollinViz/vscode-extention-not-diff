import type { ReviewScope, ViewMode } from '../domain/models';
import type { IReviewStateStore } from '../domain/ports';
import { defaultReviewScope, defaultViewMode } from '../config/defaults';

export class MemoryReviewStateStore implements IReviewStateStore {
  private scope: ReviewScope = defaultReviewScope();
  private viewMode: ViewMode = defaultViewMode();

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
}
