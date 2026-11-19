export const DEFAULT_COMMIT_COUNT = 10;
export const MIN_COMMIT_COUNT = 1;
export const HOURS_PER_DAY = 24;
export const DAYS_IN_WEEK = 7;
export const THREE_DAYS = 3;
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MS_PER_HOUR = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
export const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;
export const LAST_DAY_MS = MS_PER_DAY;
export const DEBOUNCE_REFRESH_MS = 300;
export const MIN_DEBOUNCE_REFRESH_MS = 50;
export const ZERO_DIFF_CONTEXT_LINES = 0;
export const ONE_BASED_TO_ZERO_BASED_OFFSET = 1;
export const PARENT_OFFSET = 1;
export const IMPLICIT_HUNK_COUNT = 1;
export const ADDED_LINE_ALPHA = 0.28;
export const MODIFIED_LINE_ALPHA = 0.28;
export const GIT_API_VERSION = 1;
export const EMPTY_COUNT = 0;
export const FIRST_INDEX = 0;

export const GIT_COMMAND = 'git';
export const GIT_EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const GIT_HEAD = 'HEAD';
export const GIT_UPSTREAM = '@{u}';

export const STATUS_ADDED = 'A';
export const STATUS_MODIFIED = 'M';
export const STATUS_DELETED = 'D';
export const STATUS_RENAMED = 'R';
export const STATUS_COPIED = 'C';
export const STATUS_UNTRACKED = '?';
export const STATUS_UNMERGED = 'U';

export const ARG_DIFF = 'diff';
export const ARG_UNIFIED = '--unified=0';
export const ARG_NAME_STATUS = '--name-status';
export const ARG_FIND_RENAMES = '--find-renames';
export const ARG_CACHED = '--cached';
export const ARG_NO_COLOR = '--no-color';
export const ARG_LITERAL_PATHSPECS = '--literal-pathspecs';
export const ARG_NO_EXT_DIFF = '--no-ext-diff';
export const ARG_MAX_COUNT = '--max-count';
export const ARG_REV_LIST = 'rev-list';
export const ARG_PRETTY_FORMAT = '--pretty=format:%H%x09%cI';
export const ARG_DATE_ORDER = '--date-order';
export const ARG_REV_PARSE = 'rev-parse';
export const ARG_MERGE_BASE = 'merge-base';
export const ARG_SYMBOLIC_REF = 'symbolic-ref';
export const ORIGIN_HEAD_REF = 'refs/remotes/origin/HEAD';
export const REMOTE_ORIGIN_URL_KEY = 'remote.origin.url';
export const REMOTE_ORIGIN_FETCH_KEY = 'remote.origin.fetch';
export const ARG_VERIFY = '--verify';
export const ARG_QUIET = '--quiet';
export const ARG_PORCELAIN = '--porcelain=v1';
export const ARG_NULL = '-z';
export const ARG_UNTRACKED_ALL = '--untracked-files=all';
export const ARG_CAT_FILE = 'cat-file';
export const ARG_BLOB = 'blob';
export const ARG_SHOW = 'show';
export const ARG_STATUS = 'status';

export const PRESET_LAST_24_HOURS = 'last-24-hours';
export const PRESET_LAST_3_DAYS = 'last-3-days';
export const PRESET_LAST_WEEK = 'last-week';
export const PRESET_CUSTOM = 'custom';

export const END_OF_DAY_HOUR = 23;
export const END_OF_DAY_MINUTE = 59;
export const END_OF_DAY_SECOND = 59;
export const END_OF_DAY_MILLISECOND = 999;

export const BYTES_PER_KIB = 1024;
export const KIB_PER_MIB = 1024;
export const MEBIBYTES_FOR_BUFFER = 10;
export const MAX_GIT_BUFFER_BYTES = MEBIBYTES_FOR_BUFFER * BYTES_PER_KIB * KIB_PER_MIB;
export const GIT_EXEC_TIMEOUT_MS = 30000;

export const MAX_REPO_SCAN_DEPTH = 4;
export const STATUS_BAR_PRIORITY = 100;
export const MAX_READONLY_TOGGLE_ATTEMPTS = 2;
export const POLL_INTERVAL_MS = 100;
export const WAIT_TIMEOUT_MS = 20000;
export const INTEGRATION_TIMEOUT_MS = 120000;

export const REMOTE_ORIGIN_FETCH_SPEC = '+refs/heads/*:refs/remotes/origin/*';
export const REFS_REMOTES_PREFIX = 'refs/remotes/';
export const CHANGE_DIRECTION_NEXT = 'next';
export const CHANGE_DIRECTION_PREVIOUS = 'previous';

/**
 * Opacity applied to unmodified lines when dim-unchanged is on.
 * GitLens File Heatmap fades older lines down to 0.2; 0.4 keeps surrounding
 * code readable while making the review diff the bright text.
 */
export const DEFAULT_UNCHANGED_LINE_OPACITY = 0.4;
export const OPACITY_FRACTION_DIGITS = 2;

export const ICON_GUTTER_CHANGED = 'gutter-changed.svg';
/** Solid blue of the changed-line gutter bar and overview ruler marks. */
export const CHANGE_BAR_COLOR = '#3B82F6';
export const BASE_BRANCH_CANDIDATES: readonly string[] = ['origin/master', 'origin/main', 'master', 'main'];
export const ISO_DATE_PREFIX_LENGTH = 10;
export const ISO_DATE_PREFIX_START = 0;
export const PORCELAIN_STATUS_PREFIX_LENGTH = 2;
