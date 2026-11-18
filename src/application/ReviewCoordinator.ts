import {
  DAYS_IN_WEEK,
  ISO_DATE_PREFIX_LENGTH,
  ISO_DATE_PREFIX_START,
  MIN_COMMIT_COUNT,
  MS_PER_DAY,
  PRESET_CUSTOM,
  PRESET_LAST_24_HOURS,
  PRESET_LAST_3_DAYS,
  PRESET_LAST_WEEK,
  THREE_DAYS
} from '../config/constants';
import { buildTree, changedFileKey } from '../domain/FileTreeBuilder';
import { customDateRangeToIso, expandDatePreset } from '../domain/ScopeBaseResolver';
import { InvalidScopeError, type ChangedFile, type ReviewScope } from '../domain/models';
import type { IChangeCollector, IClock, IRepositoryDiscovery, IReviewStateStore, ReviewListener, ReviewSnapshot } from '../domain/ports';
import { debounce } from './debounce';

export function formatScopeLabel(scope: ReviewScope): string {
  if (scope.kind === 'branch') {
    return 'Current branch';
  }
  if (scope.kind === 'last-n') {
    return `Last ${scope.commitCount} commits`;
  }
  if (scope.presetId === PRESET_LAST_24_HOURS) {
    return 'Last 24 hours';
  }
  if (scope.presetId === PRESET_LAST_3_DAYS) {
    return 'Last 3 days';
  }
  if (scope.presetId === PRESET_LAST_WEEK) {
    return 'Last week';
  }
  if (scope.presetId === PRESET_CUSTOM) {
    const sinceDay = scope.since.slice(ISO_DATE_PREFIX_START, ISO_DATE_PREFIX_LENGTH);
    const untilDay = scope.until.slice(ISO_DATE_PREFIX_START, ISO_DATE_PREFIX_LENGTH);
    return `Custom: ${sinceDay} – ${untilDay}`;
  }
  return `${scope.since} – ${scope.until}`;
}

export function fileKeyOf(file: ChangedFile): string {
  return changedFileKey(file.repo.id, file.relativePath);
}

export class ReviewCoordinator {
  private listener: ReviewListener | null = null;
  private lastFiles: readonly ChangedFile[] = [];
  private lastErrors: readonly string[] = [];
  private readonly debounced: { trigger(): void; dispose(): void };

  constructor(
    private readonly store: IReviewStateStore,
    private readonly discovery: IRepositoryDiscovery,
    private readonly collector: IChangeCollector,
    private readonly clock: IClock,
    private readonly debounceMs: number
  ) {
    this.debounced = debounce(() => {
      void this.refresh();
    }, debounceMs);
  }

  setListener(listener: ReviewListener): void {
    this.listener = listener;
  }

  getSnapshot(): ReviewSnapshot {
    return this.buildSnapshot();
  }

  async refresh(): Promise<void> {
    const repos = await this.discovery.discover();
    const scope = this.store.getScope();
    const result = await this.collector.collect(repos, scope);
    const deduped = dedupeFiles(result.files);
    this.lastFiles = deduped;
    this.lastErrors = result.errors;
    this.emit();
  }

  scheduleRefresh(): void {
    this.debounced.trigger();
  }

  async setScope(scope: ReviewScope): Promise<void> {
    this.store.setScope(scope);
    await this.refresh();
  }

  async setLastN(commitCount: number): Promise<void> {
    if (!Number.isInteger(commitCount) || commitCount < MIN_COMMIT_COUNT) {
      throw new InvalidScopeError(`Commit count must be an integer >= ${MIN_COMMIT_COUNT}`);
    }
    await this.setScope({ kind: 'last-n', commitCount });
  }

  async setDatePreset(presetId: string): Promise<void> {
    if (presetId === PRESET_CUSTOM) {
      throw new InvalidScopeError('Use setCustomDateRange for custom ranges');
    }
    const now = this.clock.now();
    const { since, until } = expandDatePreset(presetId, now);
    await this.setScope({ kind: 'date-range', since, until, presetId });
  }

  async setCustomDateRange(startDate: string, endDate: string): Promise<void> {
    const { since, until } = customDateRangeToIso(startDate, endDate);
    await this.setScope({ kind: 'date-range', since, until, presetId: PRESET_CUSTOM });
  }

  async setDateRangeScope(since: string, until: string, presetId: string): Promise<void> {
    await this.setScope({ kind: 'date-range', since, until, presetId });
  }

  async toggleViewMode(): Promise<void> {
    const next = this.store.getViewMode() === 'tree' ? 'flat' : 'tree';
    this.store.setViewMode(next);
    this.emit();
  }

  dispose(): void {
    this.debounced.dispose();
  }

  private buildSnapshot(): ReviewSnapshot {
    const scope = this.store.getScope();
    const viewMode = this.store.getViewMode();
    return {
      scope,
      scopeLabel: formatScopeLabel(scope),
      viewMode,
      files: this.lastFiles,
      tree: buildTree(this.lastFiles, viewMode),
      errors: this.lastErrors
    };
  }

  private emit(): void {
    this.listener?.onSnapshot(this.buildSnapshot());
  }
}

function dedupeFiles(files: readonly ChangedFile[]): readonly ChangedFile[] {
  const seen = new Map<string, ChangedFile>();
  for (const file of files) {
    seen.set(fileKeyOf(file), file);
  }
  return [...seen.values()];
}

void DAYS_IN_WEEK;
void MS_PER_DAY;
void THREE_DAYS;
