export const VIEW_CONTAINER_ID = 'review-surface';
export const VIEW_ID = 'review-surface.changes';

export const CMD_REFRESH = 'review-surface.refresh';
export const CMD_TOGGLE_VIEW_MODE = 'review-surface.toggleViewMode';
export const CMD_SET_SCOPE_LAST_N = 'review-surface.setScopeLastN';
export const CMD_SET_SCOPE_DATE_RANGE = 'review-surface.setScopeDateRange';
export const CMD_OPEN_FILE = 'review-surface.openFile';
export const CMD_OPEN_DIFF = 'review-surface.openDiffVsBase';
export const CMD_TOGGLE_EDIT_MODE = 'review-surface.toggleEditMode';
export const CMD_NEXT_CHANGE = 'review-surface.nextChange';
export const CMD_PREV_CHANGE = 'review-surface.previousChange';
export const CMD_INTERNAL_STATE = 'review-surface.internal.getSnapshot';
export const CMD_INTERNAL_TREE = 'review-surface.internal.getTree';
export const CMD_INTERNAL_SET_SCOPE = 'review-surface.internal.setScope';

export const CTX_REVIEW_FILE = 'reviewSurface.isReviewFile';
export const CTX_READ_ONLY = 'reviewSurface.isReadOnly';
export const CTX_VIEW_IS_TREE = 'reviewSurface.viewIsTree';

export const CFG_DEFAULT_COMMIT_COUNT = 'reviewSurface.defaultCommitCount';
export const CFG_DEBOUNCE_MS = 'reviewSurface.debounceRefreshMs';

export const COLOR_ADDED_LINE_BG = 'reviewSurface.addedLineBackground';
export const COLOR_MODIFIED_LINE_BG = 'reviewSurface.modifiedLineBackground';

export const SCHEME_BASE = 'review-surface-base';

export const TEST_ENV_VAR = 'REVIEW_SURFACE_TEST';
export const TEST_ENV_ENABLED = '1';
