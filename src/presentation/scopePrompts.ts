import { PRESET_CUSTOM, PRESET_LAST_24_HOURS, PRESET_LAST_3_DAYS, PRESET_LAST_WEEK } from '../config/constants';

export const SCOPE_BRANCH_ID = 'branch';

export interface ScopePresetItem {
  readonly label: string;
  readonly presetId: string;
}

export const SCOPE_PRESET_ITEMS: readonly ScopePresetItem[] = [
  { label: 'Current branch (vs base branch)', presetId: SCOPE_BRANCH_ID },
  { label: 'Last 24 hours', presetId: PRESET_LAST_24_HOURS },
  { label: 'Last 3 days', presetId: PRESET_LAST_3_DAYS },
  { label: 'Last week', presetId: PRESET_LAST_WEEK },
  { label: 'Last N commits…', presetId: 'last-n' },
  { label: 'Custom range…', presetId: PRESET_CUSTOM }
] as const;

export const CUSTOM_DATE_PLACEHOLDER = 'YYYY-MM-DD';
