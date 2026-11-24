import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import { SHIP_CONTACTS } from '../data/contacts';
import type { TourCategory } from '../data/routes';
import { osloDateKey } from '../utils/format';

const STORAGE_KEY_RAW_MATRIX = 'cache:schedule_matrix_v8';
const STORAGE_KEY_NOTES_MATRIX = 'cache:schedule_notes_v8';
const STORAGE_KEY_COMMENTS_LIST = 'cache:schedule_comments_v8';
const STORAGE_KEY_MANAGER_NOTES = 'cache:schedule_manager_notes_v8';
const STORAGE_KEY_BG_COLORS = 'cache:schedule_bg_colors_v8';
const STORAGE_KEY_FONT_LINES = 'cache:schedule_font_lines_v8';
const STORAGE_KEY_SYNC_TIME = 'cache:schedule_synced_at';
const STORAGE_KEY_SYNC_HASH = 'cache:schedule_hash_v8';
const STORAGE_KEY_GUIDE_PROFILE = 'pref:guide_profile_v1';

const RENTAL_CENTER_COL_INDEX = 2; // Column C
const GUIDE_NOTES_COL_INDEX = 11; // Column L
const GUIDES_ON_DUTY_COL_INDEX = 41; // Column AP
const STAFF_COL_START = 68;
const STAFF_COL_END = 105;
const MICHAL_CR_COL_INDEX = 95;
const SHIP_COL_BB_INDEX = 53; // Column BB

export type ContractType = 'full-time' | 'part-time';
export type TourColorStatus = 'confirmed' | 'pending' | 'closed' | 'open';

export interface GuideProfile {
  initials: string;
  fullName: string;
  contractType: ContractType;
  defaultMountain: string;
}

export interface CommentPost {
  postId?: string;
  content: string;
  author: string;
  createdTime?: string;
}

export interface SheetCommentItem {
  commentId: string;
  comment: string;
  author: string;
  row: number | null;
  column: number | null;
  cell: string | null;
  replyCount?: number;
  replies?: CommentPost[];
}

export interface ThreadedComment {
  author: string;
  content: string;
  cell?: string | null;
  replies: CommentPost[];
}

export interface GuideAssignment {
  dateString: string;
  guideCode: string;
  tourName: string;
  activity: 'snowshoe' | 'ski' | 'fatbike' | 'hiking';
  tourCategory: TourCategory;
  guestCount: number;
  vehicle: string | null;
  meetingPoint: string | null;
  shipName: string | null;
  startTimeLabel: string | null;
  endTimeLabel: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  cellNote: string | null;
  commentsList: ThreadedComment[];
  isCharter: boolean;
  rawText: string;
  sheetColumnHeader: string;
  statusColor: TourColorStatus;
  cellBgHex: string;
  isStrikethrough: boolean;
}

export type DutyStatusType = 'tour' | 'base' | 'day_off';

export interface DutyStatus {
  type: DutyStatusType;
  title: string;
  detail: string;
  alsoRentalCenter?: boolean;
  rentalCenterNote?: string;
}

export interface UpcomingDayOff {
  dateLabel: string;
  isoKey: string;
  reason: string;
}

export interface SyncPayload {
  values: string[][];
  notes: string[][];
  comments: SheetCommentItem[];
  backgrounds: string[][];
  fontLines: string[][];
  managerNotes: string[][];
  syncedAt: string;
  fromCache: boolean;
}

export interface CompanyDayTour {
  id: string;
  tourName: string;
  sheetColumnHeader: string;
  tourCategory: TourCategory;
  guestCount: number;
  assignedGuides: string[];
  isMine: boolean;
  vehicle: string | null;
  meetingPoint: string | null;
  shipName: string | null;
  startTimeLabel: string | null;
  endTimeLabel: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  statusColor: TourColorStatus;
  isCharter: boolean;
  rawText: string;
  cellNote: string | null;
  commentsList: ThreadedComment[];
}

export interface CompanyVehicleItem {
  vehicle: string;
  summary: string;
}

export interface CompanyDayOperations {
  tours: CompanyDayTour[];
  vehicles: CompanyVehicleItem[];
  rentalCenterRaw: string;
  guidesOnDutyRaw: string;
}

export interface GuideDayNotes {
  text: string;
  cellNote: string | null;
  commentsList: ThreadedComment[];
}

interface CompactV2Row {
  v?: Record<string, string>;
  n?: Record<string, string>;
  b?: Record<string, string>;
  f?: number[];
}

function inflateCompactV2(
  rows: CompactV2Row[],
  totalColumns: number
): {
  values: string[][];
  notes: string[][];
  backgrounds: string[][];
  fontLines: string[][];
} {
  const colCount = Math.max(1, totalColumns || 120);
  const values: string[][] = [];
  const notes: string[][] = [];
  const backgrounds: string[][] = [];
  const fontLines: string[][] = [];

  for (let r = 0; r < rows.length; r++) {
    const src = rows[r] ?? {};
    const vRow: string[] = new Array<string>(colCount).fill('');
    const nRow: string[] = new Array<string>(colCount).fill('');
    const bRow: string[] = new Array<string>(colCount).fill('');
    const fRow: string[] = new Array<string>(colCount).fill('');

    if (src.v) {
      for (const key of Object.keys(src.v)) {
        const c = parseInt(key, 10);
        if (c >= 0 && c < colCount) {
          vRow[c] = src.v[key] ?? '';
        }
      }
    }

    if (src.n) {
      for (const key of Object.keys(src.n)) {
        const c = parseInt(key, 10);
        if (c >= 0 && c < colCount) {
          nRow[c] = src.n[key] ?? '';
        }
      }
    }

    if (src.b) {
      for (const key of Object.keys(src.b)) {
        const c = parseInt(key, 10);
        if (c >= 0 && c < colCount) {
          bRow[c] = src.b[key] ?? '';
        }
      }
    }

    if (Array.isArray(src.f)) {
      for (const c of src.f) {
        if (c >= 0 && c < colCount) {
          fRow[c] = 'line-through';
        }
      }
    }

    values.push(vRow);
    notes.push(nRow);
    backgrounds.push(bRow);
    fontLines.push(fRow);
  }

  return { values, notes, backgrounds, fontLines };
}

export async function downloadSchedule(): Promise<SyncPayload> {
  const [cachedPayload, prevHash] = await Promise.all([
    getCachedSchedule(),
    AsyncStorage.getItem(STORAGE_KEY_SYNC_HASH).catch(() => null),
  ]);

  const queryParts = ['v=2', 'days=40'];
  if (cachedPayload && prevHash) {
    queryParts.push(`hash=${encodeURIComponent(prevHash)}`);
  }
  const sep = CONFIG.sheet.scriptUrl.includes('?') ? '&' : '?';
  const url = `${CONFIG.sheet.scriptUrl}${sep}${queryParts.join('&')}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json.status === 'not_modified' && cachedPayload) {
    const syncedAt = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEY_SYNC_TIME, syncedAt);
    return {
      ...cachedPayload,
      syncedAt,
      fromCache: false,
    };
  }

  if (json.status !== 'success') {
    throw new Error(json.message || 'Malformed spreadsheet response.');
  }

  let values: string[][];
  let notes: string[][];
  let backgrounds: string[][];
  let fontLines: string[][];

  if (json.format === 'v2' && Array.isArray(json.rows)) {
    const inflated = inflateCompactV2(
      json.rows as CompactV2Row[],
      typeof json.totalColumns === 'number' ? json.totalColumns : 120
    );
    values = inflated.values;
    notes = inflated.notes;
    backgrounds = inflated.backgrounds;
    fontLines = inflated.fontLines;
  } else if (Array.isArray(json.values)) {
    values = json.values as string[][];
    notes = Array.isArray(json.notes) ? (json.notes as string[][]) : [];
    backgrounds = Array.isArray(json.backgrounds) ? (json.backgrounds as string[][]) : [];
    fontLines = Array.isArray(json.fontLines) ? (json.fontLines as string[][]) : [];
  } else {
    throw new Error('Malformed spreadsheet response.');
  }

  const syncedAt = new Date().toISOString();
  const comments: SheetCommentItem[] = Array.isArray(json.comments)
    ? (json.comments as SheetCommentItem[])
    : [];
  const managerNotes: string[][] = Array.isArray(json.managerNotes)
    ? (json.managerNotes as string[][])
    : [];

  await AsyncStorage.setItem(STORAGE_KEY_RAW_MATRIX, JSON.stringify(values));
  await AsyncStorage.setItem(STORAGE_KEY_NOTES_MATRIX, JSON.stringify(notes));
  await AsyncStorage.setItem(STORAGE_KEY_COMMENTS_LIST, JSON.stringify(comments));
  await AsyncStorage.setItem(STORAGE_KEY_MANAGER_NOTES, JSON.stringify(managerNotes));
  await AsyncStorage.setItem(STORAGE_KEY_BG_COLORS, JSON.stringify(backgrounds));
  await AsyncStorage.setItem(STORAGE_KEY_FONT_LINES, JSON.stringify(fontLines));
  await AsyncStorage.setItem(STORAGE_KEY_SYNC_TIME, syncedAt);
  if (typeof json.hash === 'string' && json.hash.length > 0) {
    await AsyncStorage.setItem(STORAGE_KEY_SYNC_HASH, json.hash);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY_SYNC_HASH);
  }

  return {
    values,
    notes,
    comments,
    backgrounds,
    fontLines,
    managerNotes,
    syncedAt,
    fromCache: false,
  };
}

export async function getCachedSchedule(): Promise<SyncPayload | null> {
  try {
    const rawVal = await AsyncStorage.getItem(STORAGE_KEY_RAW_MATRIX);
    const rawNotes = await AsyncStorage.getItem(STORAGE_KEY_NOTES_MATRIX);
    const rawComments = await AsyncStorage.getItem(STORAGE_KEY_COMMENTS_LIST);
    const rawManagerNotes = await AsyncStorage.getItem(STORAGE_KEY_MANAGER_NOTES);
    const rawBg = await AsyncStorage.getItem(STORAGE_KEY_BG_COLORS);
    const rawLines = await AsyncStorage.getItem(STORAGE_KEY_FONT_LINES);
    const syncedAt = await AsyncStorage.getItem(STORAGE_KEY_SYNC_TIME);
    if (!rawVal) return null;

    return {
      values: JSON.parse(rawVal) as string[][],
      notes: rawNotes ? (JSON.parse(rawNotes) as string[][]) : [],
      comments: rawComments ? (JSON.parse(rawComments) as SheetCommentItem[]) : [],
      backgrounds: rawBg ? (JSON.parse(rawBg) as string[][]) : [],
      fontLines: rawLines ? (JSON.parse(rawLines) as string[][]) : [],
      managerNotes: rawManagerNotes ? (JSON.parse(rawManagerNotes) as string[][]) : [],
      syncedAt: syncedAt || new Date().toISOString(),
      fromCache: true,
    };
  } catch {
    return null;
  }
}

export async function isGuideProfileConfigured(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_GUIDE_PROFILE);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<GuideProfile>;
    return Boolean(parsed.initials && parsed.fullName);
  } catch {
    return false;
  }
}

export async function getGuideProfile(): Promise<GuideProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_GUIDE_PROFILE);
    if (raw) return JSON.parse(raw) as GuideProfile;
  } catch {}
  return {
    initials: CONFIG.defaults.guideInitials,
    fullName: CONFIG.defaults.guideFullName,
    contractType: CONFIG.defaults.contractType,
    defaultMountain: CONFIG.defaults.defaultMountain,
  };
}

export async function saveGuideProfile(profile: GuideProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_GUIDE_PROFILE, JSON.stringify(profile));
}

function normalizeHeader(cell: unknown): string {
  return (cell ?? '').toString().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseIntOrZero(value: unknown): number {
  const num = parseInt((value ?? '').toString().trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function isTourColumn(colIndex: number, headerText: string): boolean {
  const clean = headerText.trim();
  if (!clean) return false;

  const lower = clean.toLowerCase();

  if (
    lower.includes('meeting') ||
    lower.includes('on duty') ||
    lower.includes('available guides') ||
    lower.includes('needed guides') ||
    lower.includes('workshop') ||
    lower.includes('tasks') ||
    lower.includes('deliver') ||
    lower.includes('pick up') ||
    lower.includes('extra opening') ||
    lower === 't-ø' ||
    lower === 't-o' ||
    lower === 'l-s' ||
    lower === 'forecast' ||
    lower === 'on board' ||
    lower === 'shop' ||
    lower === 'ship' ||
    lower === 'pax' ||
    lower === 'minibus' ||
    lower.startsWith('caravelle')
  ) {
    return false;
  }

  const isRegularTour = colIndex >= 22 && colIndex <= 39;
  const isShipTour = colIndex >= 44 && colIndex <= 53;
  const isCharterTour = colIndex >= 54 && colIndex <= 63;

  return isRegularTour || isShipTour || isCharterTour;
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeRangeFromText(
  text: string
): { startMinutes: number; endMinutes: number | null; startLabel: string; endLabel: string | null } | null {
  if (!text) return null;

  const rangeRegex = /\b(\d{1,2})([:.])\s*(\d{2})\s*[-–]\s*(\d{1,2})(?:([:.])\s*(\d{2}))?\b/g;
  let match: RegExpExecArray | null;

  while ((match = rangeRegex.exec(text)) !== null) {
    const sh = parseInt(match[1] ?? '', 10);
    const sSep = match[2] ?? ':';
    const sm = parseInt(match[3] ?? '', 10);
    const eh = parseInt(match[4] ?? '', 10);
    const eSep = match[5] ?? ':';
    const em = match[6] ? parseInt(match[6], 10) : 0;

    if (
      Number.isFinite(sh) &&
      Number.isFinite(sm) &&
      Number.isFinite(eh) &&
      Number.isFinite(em) &&
      sh >= 7 &&
      sh <= 23 &&
      sm >= 0 &&
      sm <= 59 &&
      eh >= 7 &&
      eh <= 23 &&
      em >= 0 &&
      em <= 59
    ) {
      if (sSep === '.' && match[6] && eSep === '.' && (sm % 5 !== 0 || em % 5 !== 0)) {
        continue;
      }
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      if (endMinutes > startMinutes) {
        return {
          startMinutes,
          endMinutes,
          startLabel: formatHHMM(startMinutes),
          endLabel: formatHHMM(endMinutes),
        };
      }
    }
  }

  const singleRegex = /(?:^|\s|at\s+)(\d{1,2})([:.])\s*(\d{2})(?!\.\d)\b/gi;
  let singleMatch: RegExpExecArray | null;
  while ((singleMatch = singleRegex.exec(text)) !== null) {
    const sh = parseInt(singleMatch[1] ?? '', 10);
    const sep = singleMatch[2] ?? ':';
    const sm = parseInt(singleMatch[3] ?? '', 10);
    if (sh >= 7 && sh <= 23 && sm >= 0 && sm <= 59) {
      if (sep === '.' && sm % 5 !== 0) {
        continue;
      }
      const startMinutes = sh * 60 + sm;
      return {
        startMinutes,
        endMinutes: null,
        startLabel: formatHHMM(startMinutes),
        endLabel: null,
      };
    }
  }

  return null;
}

function inferTourCategory(headerTitle: string, combinedText: string): {
  activity: 'snowshoe' | 'ski' | 'fatbike' | 'hiking';
  tourCategory: TourCategory;
} {
  const combined = `${headerTitle} ${combinedText}`.toLowerCase();

  if (
    combined.includes('coffe') ||
    combined.includes('coffee') ||
    combined.includes('cafe') ||
    combined.includes('tove') ||
    combined.includes('malangen')
  ) {
    return { activity: 'snowshoe', tourCategory: 'coffee_snowshoe' };
  }

  if (combined.includes('fatbik') || combined.includes('bike')) {
    return { activity: 'fatbike', tourCategory: 'fatbike' };
  }

  if (
    combined.includes('hill hike') ||
    combined.includes('brosmetind') ||
    combined.includes('nattmål') ||
    combined.includes('tverrfjell') ||
    combined.includes('rundfjell') ||
    combined.includes('sightseeing hike') ||
    combined.includes('hike')
  ) {
    return { activity: 'hiking', tourCategory: 'hill_hike' };
  }

  if (combined.includes('snowshoe')) {
    return { activity: 'snowshoe', tourCategory: 'easy_snowshoe' };
  }

  if (combined.includes('ski')) {
    return { activity: 'ski', tourCategory: 'ski' };
  }

  // Trollfjord, Finnmarken, and Midnatsol cruise boats default to ski trips
  // unless another activity is explicitly mentioned above.
  if (
    combined.includes('trollfjord') ||
    combined.includes('finnmarken') ||
    combined.includes('midnatsol') ||
    combined.includes('midnattsol')
  ) {
    return { activity: 'ski', tourCategory: 'ski' };
  }

  return { activity: 'snowshoe', tourCategory: 'easy_snowshoe' };
}

function activityDisplayLabel(category: TourCategory): string {
  switch (category) {
    case 'hill_hike':
      return 'Hill Hike';
    case 'coffee_snowshoe':
      return 'Coffee Trip';
    case 'fatbike':
      return 'Fatbike';
    case 'ski':
      return 'Ski Trip';
    case 'easy_snowshoe':
      return 'Snowshoe Trip';
    default:
      return 'Tour';
  }
}

function detectShipInText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const ship of SHIP_CONTACTS) {
    if (ship.keywords.some((kw) => lower.includes(kw))) {
      return ship.name;
    }
  }
  const mein = /mein\s*schiff(?:\s*\d+)?/i.exec(text);
  if (mein) return mein[0].replace(/\s+/g, ' ').trim();
  const fred = /fred\s*olsen/i.exec(text);
  if (fred) return 'Fred Olsen';
  if (/\b(?:ms\s*)?hamburg\b/i.test(text)) return 'MS Hamburg';
  return null;
}

function normalizeShipCellValue(rawVal: string): string {
  const trimmed = rawVal.trim();
  if (!trimmed) return '';
  return detectShipInText(trimmed) ?? trimmed;
}

function detectVehicleInText(text: string): string | null {
  const caravelleNum = /\bcaravelle\s*#?\s*([234])\b/i.exec(text) ?? /\bc([234])\b/i.exec(text);
  if (caravelleNum && caravelleNum[1]) {
    return `Caravelle #${caravelleNum[1]}`;
  }
  if (/\bcaravelle\b/i.test(text)) return 'Caravelle';
  if (/\bminibus\b/i.test(text)) return 'Minibus';
  if (/\btaxi\b/i.test(text)) return 'Taxi';
  return null;
}

function detectMeetingPoint(
  text: string,
  headerTitle: string,
  shipName: string | null
): string | null {
  const combined = `${headerTitle} ${text}`;
  const lower = combined.toLowerCase();

  const kaiMatch = /\bkai\s*(8|21)\b/i.exec(combined);
  if (kaiMatch && kaiMatch[1]) return `Kai ${kaiMatch[1]}`;

  if (lower.includes('prostneset')) return 'Prostneset';
  if (lower.includes('breivika')) return 'Breivika';
  if (lower.includes('radisson')) return 'Radisson Blu';
  if (lower.includes('fredrik langes') || lower.includes('at shop')) {
    return 'Tromsø Outdoor Shop';
  }

  const isAfternoonShip =
    lower.includes('14:15') ||
    lower.includes('14.15') ||
    /\bhg\b/i.test(headerTitle) ||
    Boolean(shipName && (lower.includes('hurtigruten') || lower.includes('havila') || lower.includes('capella') || lower.includes('castor') || lower.includes('polaris') || lower.includes('pollux')));

  if (isAfternoonShip) {
    return 'Prostneset';
  }

  return null;
}

function matchRegularTourTitle(headerTitle: string): string | null {
  const lower = headerTitle.toLowerCase();

  // Coastal cruise (Hurtigruten / Havila) regular tours
  if (/\bm5\b/.test(lower) || (lower.includes('ski') && /14[:.]15/.test(lower))) {
    return 'HG ski trip';
  }
  if (/\bn5\b/.test(lower) || (lower.includes('snowshoe') && /14[:.]15/.test(lower))) {
    return 'HG snowshoe trip';
  }

  if (lower.includes('coffe') || lower.includes('coffee')) {
    return 'Coffee trip';
  }
  if (lower.includes('fatbik')) {
    return 'Fatbike trip';
  }
  if (lower.includes('brosmetind') || lower.includes('sightseeing hike')) {
    return 'Sightseeing hike';
  }
  if (lower.includes('w 104') || lower.includes('hill hike')) {
    return 'Hill hike';
  }
  if (lower.includes('w 103') || (lower.includes('snowshoe') && /10[:.]00/.test(lower))) {
    return 'Easy snowshoe trip';
  }
  if (lower.includes('w 101') || lower.includes('ski trip')) {
    if (/13[:.]30|14[:.]00|afternoon/.test(lower)) {
      return 'Ski trip afternoon';
    }
    return 'Ski trip morning';
  }

  return null;
}

const KNOWN_PARTNERS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bnext\s+travel\s+nordic\b/i, label: 'Next Travel Nordic' },
  { pattern: /\bdelta\s+of\s+scandinavia\b/i, label: 'Delta of Scandinavia' },
  { pattern: /\bbest\s+arctic\b/i, label: 'Best Arctic' },
  { pattern: /\bnordic\s+tours\b/i, label: 'Nordic Tours' },
  { pattern: /\bbaraka\b/i, label: 'Baraka' },
  { pattern: /\bintrepid\b/i, label: 'Intrepid' },
  { pattern: /\bs\.h\.tours\b/i, label: 'S.H.Tours' },
  { pattern: /\btui\b/i, label: 'TUI' },
  { pattern: /\becs\b/i, label: 'ECS' },
];

function buildDisplayTourName(params: {
  headerTitle: string;
  cellText: string;
  shipName: string | null;
  tourCategory: TourCategory;
}): string {
  const { headerTitle, cellText, shipName, tourCategory } = params;
  const lowerHeader = headerTitle.toLowerCase();
  const activityLabel = activityDisplayLabel(tourCategory);

  const regularTitle = matchRegularTourTitle(headerTitle);
  if (regularTitle) {
    if (shipName && !regularTitle.toLowerCase().includes(shipName.toLowerCase())) {
      return `${regularTitle} · ${shipName}`;
    }
    return regularTitle;
  }

  const isGenericHeader =
    lowerHeader.startsWith('group booking') ||
    lowerHeader.startsWith('multyday');

  if (isGenericHeader) {
    if (shipName) {
      return `${shipName} · ${activityLabel}`;
    }
    const partner = KNOWN_PARTNERS.find((p) => p.pattern.test(cellText));
    if (partner) {
      return `${partner.label} · ${activityLabel}`;
    }
    if (/\bprivate\b/i.test(cellText)) {
      return `Private · ${activityLabel}`;
    }
    return `${activityLabel} (${headerTitle})`;
  }

  if (shipName && !lowerHeader.includes(shipName.toLowerCase())) {
    return `${headerTitle} · ${shipName}`;
  }

  return headerTitle || 'Scheduled Tour';
}

function classifyCellColor(hexColor: string): TourColorStatus {
  if (!hexColor || hexColor === '#ffffff' || hexColor.toLowerCase() === '#ffffff') {
    return 'open';
  }
  const clean = hexColor.replace('#', '').trim();
  if (clean.length !== 6) return 'open';

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  if (r > 190 && g < 80 && b < 80) return 'closed';
  if (g > 170 && r < 140 && b < 140) return 'confirmed';
  if (r > 200 && g > 200 && b < 100) return 'pending';

  return 'open';
}

function findStaffColumnIndex(headerRow: string[], profile: GuideProfile): number {
  const targetName = profile.fullName.trim().toLowerCase();
  const maxCol = Math.min(STAFF_COL_END, headerRow.length - 1);

  for (let c = STAFF_COL_START; c <= maxCol; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (targetName && h.includes(targetName)) {
      return c;
    }
  }

  if (
    (targetName === 'michal' || profile.initials.trim().toLowerCase() === 'mh') &&
    headerRow.length > MICHAL_CR_COL_INDEX
  ) {
    return MICHAL_CR_COL_INDEX;
  }

  return -1;
}

function isOnDutyMarker(cellLower: string): boolean {
  return (
    cellLower.includes('work') ||
    cellLower.includes('rc') ||
    cellLower.includes('sato') ||
    cellLower.includes('first aid') ||
    cellLower.includes('training') ||
    cellLower.includes('inventory') ||
    cellLower.includes('email') ||
    cellLower.includes('guiding') ||
    cellLower.includes('course') ||
    cellLower.includes('military')
  );
}

const AMBIGUOUS_WORD_INITIALS = new Set([
  'to', 'he', 'in', 'no', 'at', 'on', 'or', 'as', 'is', 'by', 'an',
  'am', 'pm', 'so', 'do', 'go', 'up', 'my', 'we', 'me', 'be', 'if',
  'of', 'it', 'us', 'ok',
]);

function cellContainsGuideInitials(cellValue: unknown, guideInitials: string): boolean {
  const targetClean = guideInitials.trim();
  if (!targetClean) return false;
  const targetLower = targetClean.toLowerCase();

  const raw = (cellValue ?? '').toString().trim();
  if (!raw) return false;

  const tokens = raw.split(/[^A-Za-z0-9ÆØÅæøå]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return false;

  const isAmbiguous = AMBIGUOUS_WORD_INITIALS.has(targetLower);
  const allShortInitials = tokens.every((t) => t.length <= 3 && !/^\d+$/.test(t));

  for (const token of tokens) {
    if (token.toLowerCase() !== targetLower) continue;
    if (!isAmbiguous) return true;
    // For ambiguous English words like "to" or "he", require at least one uppercase letter
    // (e.g. "To", "TO", "He", "HE"), unless the entire cell is just short initials ("to", "to/mh")
    if (/[A-ZÆØÅ]/.test(token) || allShortInitials) {
      return true;
    }
  }

  return false;
}

function isDayOffMarker(rawCell: string, guideInitials: string): boolean {
  const cellLower = rawCell.toLowerCase();
  if (!cellLower) return false;
  if (cellContainsGuideInitials(rawCell, guideInitials)) {
    return true;
  }
  return (
    cellLower.includes('off') ||
    cellLower.includes('holiday') ||
    cellLower.includes('avspasering') ||
    cellLower.includes('unpaid') ||
    cellLower.includes('leave') ||
    cellLower.includes('request') ||
    cellLower.includes('permisjon')
  );
}

function findRentalCenterColIndex(headerRow: string[]): number {
  const maxScan = Math.min(10, headerRow.length - 1);
  for (let c = 0; c <= maxScan; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('rental center') || h.includes('rental centre')) {
      return c;
    }
  }
  return RENTAL_CENTER_COL_INDEX;
}

function findGuideNotesColIndex(headerRow: string[]): number {
  const maxScan = Math.min(21, headerRow.length - 1);
  for (let c = 3; c <= maxScan; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('guide note') || h.includes('guides note')) {
      return c;
    }
  }
  return GUIDE_NOTES_COL_INDEX;
}

function findGuidesOnDutyColIndex(headerRow: string[]): number {
  for (let c = 20; c < Math.min(STAFF_COL_START, headerRow.length); c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('guides on duty')) {
      return c;
    }
  }
  return GUIDES_ON_DUTY_COL_INDEX;
}

export function parseGuideDayNotes(
  matrix: string[][],
  notes: string[][],
  comments: SheetCommentItem[],
  targetDate: Date = new Date()
): GuideDayNotes | null {
  const targetRowIdx = findRowIndexForDate(matrix, targetDate);
  if (targetRowIdx === -1) return null;

  const headerRow = matrix[1] || [];
  const colIdx = findGuideNotesColIndex(headerRow);
  const row = matrix[targetRowIdx] || [];
  const noteRow = notes[targetRowIdx] || [];

  const text = (row[colIdx] || '').toString().trim();
  const cellNote = (noteRow[colIdx] || '').toString().trim() || null;

  const sheetRowNumber = targetRowIdx + 1;
  const col1Based = colIdx + 1;
  const matchedComments = comments.filter(
    (com) => com.row === sheetRowNumber && com.column === col1Based
  );
  const commentsList: ThreadedComment[] = matchedComments.map((com) => ({
    author: com.author || 'Office',
    content: com.comment,
    cell: com.cell,
    replies: Array.isArray(com.replies) ? com.replies : [],
  }));

  if (!text && !cellNote && commentsList.length === 0) {
    return null;
  }

  return { text, cellNote, commentsList };
}

export function calculateDutyStatus(
  matrix: string[][],
  targetRowIdx: number,
  profile: GuideProfile,
  assignmentsCount: number
): DutyStatus {
  const hasMatrix = targetRowIdx !== -1 && Array.isArray(matrix) && matrix.length >= 2;
  const headerRow = hasMatrix ? (matrix[1] || []) : [];
  const row = hasMatrix ? (matrix[targetRowIdx] || []) : [];

  const rentalColIdx = hasMatrix ? findRentalCenterColIndex(headerRow) : RENTAL_CENTER_COL_INDEX;
  const guidesOnDutyColIdx = hasMatrix
    ? findGuidesOnDutyColIndex(headerRow)
    : GUIDES_ON_DUTY_COL_INDEX;

  const rawRentalCell = hasMatrix ? (row[rentalColIdx] || '').toString().trim() : '';
  const rawGuidesCell = hasMatrix ? (row[guidesOnDutyColIdx] || '').toString().trim() : '';

  const inRentalCenter = hasMatrix && cellContainsGuideInitials(rawRentalCell, profile.initials);
  const inGuidesOnDuty = hasMatrix && cellContainsGuideInitials(rawGuidesCell, profile.initials);

  if (assignmentsCount > 0) {
    if (inRentalCenter) {
      return {
        type: 'tour',
        title: `${assignmentsCount} Tour${assignmentsCount > 1 ? 's' : ''} + Rental Center`,
        detail: `Also listed in Rental Center (Col C): "${rawRentalCell}".`,
        alsoRentalCenter: true,
        rentalCenterNote: rawRentalCell,
      };
    }
    return {
      type: 'tour',
      title: `${assignmentsCount} Tour${assignmentsCount > 1 ? 's' : ''} Assigned`,
      detail: 'Scheduled in field operations today.',
    };
  }

  if (!hasMatrix) {
    return {
      type: 'base',
      title: 'No Tours Scheduled',
      detail: 'Check dispatch for base duties.',
    };
  }

  // 0-tour days: check Column C (Rental Center) and Column AP (Guides on Duty) first
  if (inRentalCenter && inGuidesOnDuty) {
    return {
      type: 'base',
      title: 'Rental Center + Guiding (No Tour)',
      detail: `Listed in Rental Center ("${rawRentalCell}") and Guides on Duty — no tour assigned yet.`,
      alsoRentalCenter: true,
      rentalCenterNote: rawRentalCell,
    };
  }

  if (inRentalCenter) {
    return {
      type: 'base',
      title: 'Rental Center',
      detail: `Listed in Rental Center (Col C): "${rawRentalCell}".`,
      alsoRentalCenter: true,
      rentalCenterNote: rawRentalCell,
    };
  }

  if (inGuidesOnDuty) {
    return {
      type: 'base',
      title: 'Guiding — No Tour Assigned',
      detail: 'Listed in Guides on Duty (Col AP), with no tour assigned yet.',
    };
  }

  const nameColIdx = findStaffColumnIndex(headerRow, profile);

  if (nameColIdx === -1) {
    return profile.contractType === 'full-time'
      ? { type: 'base', title: 'Base / Workshop Duty', detail: 'No tour assigned. On duty at shop/base.' }
      : { type: 'day_off', title: 'Day Off', detail: 'No tours or shift assigned today.' };
  }

  const rawCell = (row[nameColIdx] || '').toString().trim();
  const cellLower = rawCell.toLowerCase();

  if (cellLower.length === 0) {
    if (profile.contractType === 'full-time') {
      return {
        type: 'base',
        title: 'Base / Workshop Duty',
        detail: 'On duty at Tromsø Outdoor (Rental Centre/Workshop). No tours.',
      };
    }
    return {
      type: 'day_off',
      title: 'Day Off',
      detail: 'No shift scheduled today.',
    };
  }

  if (isDayOffMarker(rawCell, profile.initials)) {
    return {
      type: 'day_off',
      title: 'Day Off / Leave',
      detail: `Marked "${rawCell}" in your schedule column.`,
    };
  }

  if (isOnDutyMarker(cellLower)) {
    return {
      type: 'base',
      title: 'On Duty (Base / Training)',
      detail: `Schedule note: "${rawCell}".`,
    };
  }

  if (profile.contractType === 'full-time') {
    return {
      type: 'day_off',
      title: 'Day Off / Leave',
      detail: `Marked "${rawCell}" in your schedule column.`,
    };
  }

  return {
    type: 'base',
    title: 'Scheduled on Duty',
    detail: `Roster note: "${rawCell}".`,
  };
}

export function findRowIndexForDate(matrix: string[][], targetDate: Date): number {
  if (!matrix || matrix.length < 3) return -1;

  const dayNumber = targetDate.getDate();
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  const targetMonth = monthNames[targetDate.getMonth()] ?? '';

  let currentMonth = '';
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const col0 = (row[0] || '').toString().trim().toUpperCase();
    if (monthNames.includes(col0)) {
      currentMonth = col0;
      continue;
    }

    const col1Day = parseInt((row[1] || '').toString().trim(), 10);
    if (currentMonth === targetMonth && col1Day === dayNumber) {
      return r;
    }
  }

  for (let r = 0; r < matrix.length; r++) {
    const col1Day = parseInt((matrix[r]?.[1] || '').toString().trim(), 10);
    if (col1Day === dayNumber) {
      return r;
    }
  }

  return -1;
}

export function findUpcomingDaysOff(
  matrix: string[][],
  notes: string[][],
  comments: SheetCommentItem[],
  backgrounds: string[][],
  fontLines: string[][],
  profile: GuideProfile,
  fromDate: Date = new Date(),
  daysAhead: number = 14
): UpcomingDayOff[] {
  if (!matrix || matrix.length < 3) return [];

  const upcoming: UpcomingDayOff[] = [];
  for (let offset = 1; offset <= daysAhead; offset++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + offset);
    const { assignments, targetRowIdx } = parseGuideAssignments(
      matrix,
      notes,
      comments,
      backgrounds,
      fontLines,
      profile.initials,
      d
    );
    if (targetRowIdx === -1) continue;
    const status = calculateDutyStatus(matrix, targetRowIdx, profile, assignments.length);
    if (status.type === 'day_off') {
      upcoming.push({
        dateLabel: d.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        isoKey: osloDateKey(d),
        reason: status.detail,
      });
    }
    if (upcoming.length >= 4) break;
  }

  return upcoming;
}

export function parseGuideAssignments(
  matrix: string[][],
  notes: string[][],
  comments: SheetCommentItem[],
  backgrounds: string[][],
  fontLines: string[][],
  guideCode: string,
  targetDate: Date = new Date()
): { assignments: GuideAssignment[]; targetRowIdx: number } {
  const targetRowIdx = findRowIndexForDate(matrix, targetDate);
  if (targetRowIdx === -1) return { assignments: [], targetRowIdx: -1 };

  const headerRow = matrix[1] || [];
  const row = matrix[targetRowIdx] || [];
  const noteRow = notes[targetRowIdx] || [];
  const bgRow = backgrounds[targetRowIdx] || [];
  const fontLineRow = fontLines[targetRowIdx] || [];

  const assignments: GuideAssignment[] = [];
  const cleanCode = guideCode.trim().toLowerCase();
  const sheetRowNumber = targetRowIdx + 1;

  for (let c = 2; c < row.length; c++) {
    const headerTitle = normalizeHeader(headerRow[c]);
    if (!isTourColumn(c, headerTitle)) continue;

    const cellText = (row[c] || '').toString();
    const lowerCell = cellText.toLowerCase();
    if (!cellText || lowerCell.includes('closed') || lowerCell.includes('canceled') || lowerCell.includes('cancelled')) {
      continue;
    }

    const isStrikethrough = (fontLineRow[c] || '').toString().toLowerCase().includes('line-through');
    if (isStrikethrough) {
      continue;
    }

    if (!cellContainsGuideInitials(cellText, guideCode)) continue;

    const hNext1 = normalizeHeader(headerRow[c + 1]).toLowerCase();
    const hNext2 = normalizeHeader(headerRow[c + 2]).toLowerCase();
    const hNext3 = normalizeHeader(headerRow[c + 3]).toLowerCase();
    const isShipBookingBlock =
      hNext1 === 'forecast' && hNext2 === 'on board' && hNext3 === 'shop';

    let guestCount = 0;
    let shipName: string | null = null;
    const commentCols1Based: number[] = [c + 1, c + 2];
    const noteCols0Based: number[] = [c, c + 1];

    if (isShipBookingBlock) {
      const onBoard = parseIntOrZero(row[c + 2]);
      const shop = parseIntOrZero(row[c + 3]);
      guestCount = onBoard + shop;

      commentCols1Based.push(c + 3, c + 4);
      noteCols0Based.push(c + 2, c + 3);

      const maxShipCol = Math.max(c + 8, SHIP_COL_BB_INDEX);
      for (let s = c + 4; s <= Math.min(maxShipCol, headerRow.length - 1); s++) {
        if (normalizeHeader(headerRow[s]).toLowerCase() === 'ship' || s === SHIP_COL_BB_INDEX) {
          const val = normalizeShipCellValue((row[s] || '').toString());
          if (val) {
            shipName = val;
            commentCols1Based.push(s + 1);
            noteCols0Based.push(s);
            break;
          }
        }
      }
    } else {
      guestCount = parseIntOrZero(row[c + 1]);
      if (guestCount === 0) {
        const inlinePax = /(\d+)\s*pax\b/i.exec(cellText);
        if (inlinePax && inlinePax[1]) {
          guestCount = parseIntOrZero(inlinePax[1]);
        }
      }
    }

    const uniqueCommentCols = new Set(commentCols1Based);
    const matchedComments = comments.filter(
      (com) =>
        com.row === sheetRowNumber &&
        com.column !== null &&
        uniqueCommentCols.has(com.column)
    );

    const commentsList: ThreadedComment[] = matchedComments.map((com) => ({
      author: com.author || 'Office',
      content: com.comment,
      cell: com.cell,
      replies: Array.isArray(com.replies) ? com.replies : [],
    }));

    const uniqueNoteCols = Array.from(new Set(noteCols0Based));
    const classicNotes = uniqueNoteCols
      .map((idx) => (noteRow[idx] || '').toString().trim())
      .filter((n) => n.length > 0);

    const combinedClassicNote = Array.from(new Set(classicNotes)).join(' • ');

    const allNoteAndCommentText = [
      cellText,
      combinedClassicNote,
      ...commentsList.map((cm) => `${cm.content} ${cm.replies.map((r) => r.content).join(' ')}`),
    ].join(' ');

    if (!shipName) {
      shipName = detectShipInText(allNoteAndCommentText);
    }

    const vehicle = detectVehicleInText(allNoteAndCommentText);
    const meetingPoint = detectMeetingPoint(allNoteAndCommentText, headerTitle, shipName);

    const { activity, tourCategory } = inferTourCategory(headerTitle, allNoteAndCommentText);
    const isCharter = c >= 44;

    const parsedTime =
      parseTimeRangeFromText(cellText) ??
      parseTimeRangeFromText(combinedClassicNote) ??
      parseTimeRangeFromText(headerTitle);

    const defaultDur =
      tourCategory === 'hill_hike'
        ? 300
        : tourCategory === 'coffee_snowshoe'
          ? 270
          : tourCategory === 'easy_snowshoe'
            ? 150
            : 180;

    const startMinutes = parsedTime?.startMinutes ?? null;
    const endMinutes =
      parsedTime?.endMinutes ??
      (startMinutes !== null ? startMinutes + defaultDur : null);

    const displayTourName = buildDisplayTourName({
      headerTitle,
      cellText: allNoteAndCommentText,
      shipName,
      tourCategory,
    });

    const cellBg = (bgRow[c] || '').toString();
    const statusColor = classifyCellColor(cellBg);

    assignments.push({
      dateString: targetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      guideCode,
      tourName: displayTourName,
      activity,
      tourCategory,
      guestCount,
      vehicle,
      meetingPoint,
      shipName,
      startTimeLabel: parsedTime?.startLabel ?? null,
      endTimeLabel:
        parsedTime?.endLabel ?? (endMinutes !== null ? formatHHMM(endMinutes) : null),
      startMinutes,
      endMinutes,
      cellNote: combinedClassicNote || null,
      commentsList,
      isCharter,
      rawText: cellText.trim(),
      sheetColumnHeader: headerTitle,
      statusColor,
      cellBgHex: cellBg,
      isStrikethrough,
    });
  }

  assignments.sort((a, b) => {
    const aMin = a.startMinutes ?? 9999;
    const bMin = b.startMinutes ?? 9999;
    return aMin - bMin;
  });

  return { assignments, targetRowIdx };
}

const NON_GUIDE_TOKENS = new Set([
  'c2', 'c3', 'c4', 'caravelle', 'minibus', 'taxi', 'bus', 'van',
  'pax', 'kai', 'prostneset', 'breivika', 'radisson', 'shop',
  'hg', 'hurtigruten', 'havila', 'capella', 'castor', 'polaris', 'pollux',
  'finnmarken', 'midnatsol', 'trollfjord', 'kong', 'harald', 'nordkapp', 'nordlys', 'nordnorge',
  'richard', 'vesteralen', 'polarlys', 'mein', 'schiff', 'fred', 'olsen',
  'ski', 'xc', 'snowshoe', 'fatbike', 'bike', 'hill', 'hike', 'coffee', 'trip', 'tour', 'charter',
  'tverrfjellet', 'rundfjellet', 'malangen', 'charlottenlund', 'tove',
  'open', 'closed', 'yes', 'tbd', 'new', 'extra', 'group', 'private', 'vip',
  'hrs', 'min',
]);

// Common short English/Norwegian words: only ignored when all-lowercase in prose
// (capitalized tokens like "To", "TO", "He", "HE", "No", "Am" are kept as guide initials!)
const LOWERCASE_ONLY_STOPWORDS = new Set([
  'to', 'he', 'in', 'no', 'at', 'on', 'or', 'as', 'is', 'by', 'an',
  'am', 'pm', 'so', 'do', 'go', 'up', 'my', 'we', 'me', 'be', 'if',
  'of', 'it', 'us', 'ok', 'and', 'for', 'the', 'from', 'with', 'not',
  'but', 'per', 'via', 'hr', 'h',
]);

function extractAssignedGuidesFromCell(
  cellText: string,
  staffFirstNamesLower: Set<string>
): string[] {
  const cleaned = cellText
    .replace(/\b\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}(?:[:.]\d{2})?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\bcaravelle\s*#?\s*[234]\b/gi, ' ')
    .replace(/\bkai\s*(?:8|21)\b/gi, ' ')
    .replace(/\b\d+\s*pax\b/gi, ' ');

  const rawTokens = cleaned.split(/[^A-Za-zÆØÅæøå]+/).filter((t) => t.length > 0);
  const allShortTokens = rawTokens.length > 0 && rawTokens.every((t) => t.length <= 3);
  const found: string[] = [];
  const seen = new Set<string>();

  for (const token of rawTokens) {
    const lower = token.toLowerCase();
    if (NON_GUIDE_TOKENS.has(lower)) continue;

    const isAllLower = token === lower;
    if (LOWERCASE_ONLY_STOPWORDS.has(lower) && isAllLower && !allShortTokens) {
      continue;
    }

    const isShortInitials = token.length >= 2 && token.length <= 3;
    const isStaffName = staffFirstNamesLower.has(lower);

    if ((isShortInitials || isStaffName) && !seen.has(lower)) {
      seen.add(lower);
      found.push(token);
    }
  }

  return found;
}

export function parseCompanyDayOperations(
  matrix: string[][],
  notes: string[][],
  comments: SheetCommentItem[],
  backgrounds: string[][],
  fontLines: string[][],
  myInitials: string,
  targetDate: Date = new Date()
): CompanyDayOperations {
  const targetRowIdx = findRowIndexForDate(matrix, targetDate);
  if (targetRowIdx === -1) {
    return { tours: [], vehicles: [], rentalCenterRaw: '', guidesOnDutyRaw: '' };
  }

  const headerRow = matrix[1] || [];
  const row = matrix[targetRowIdx] || [];
  const noteRow = notes[targetRowIdx] || [];
  const bgRow = backgrounds[targetRowIdx] || [];
  const fontLineRow = fontLines[targetRowIdx] || [];

  const myCodeLower = myInitials.trim().toLowerCase();
  const sheetRowNumber = targetRowIdx + 1;

  const staffFirstNamesLower = new Set<string>();
  const maxStaffCol = Math.min(STAFF_COL_END, headerRow.length - 1);
  for (let sc = STAFF_COL_START; sc <= maxStaffCol; sc++) {
    const h = normalizeHeader(headerRow[sc]).toLowerCase();
    for (const part of h.split(/[^a-zæøå]+/)) {
      if (part.length >= 3) staffFirstNamesLower.add(part);
    }
  }

  const rentalColIdx = findRentalCenterColIndex(headerRow);
  const guidesOnDutyColIdx = findGuidesOnDutyColIndex(headerRow);
  const rentalCenterRaw = (row[rentalColIdx] || '').toString().trim();
  const guidesOnDutyRaw = (row[guidesOnDutyColIdx] || '').toString().trim();

  const tours: CompanyDayTour[] = [];
  const vehicleMap = new Map<string, string[]>();

  const addVehicleEntry = (vehicleName: string, detail: string) => {
    const list = vehicleMap.get(vehicleName) ?? [];
    if (detail && !list.includes(detail)) {
      list.push(detail);
    }
    vehicleMap.set(vehicleName, list);
  };

  // Scan dedicated Caravelle / Minibus columns if present in the sheet
  for (let c = 2; c < row.length; c++) {
    const hTitle = normalizeHeader(headerRow[c]);
    const hLower = hTitle.toLowerCase();
    if (hLower.startsWith('caravelle') || hLower === 'minibus') {
      const val = (row[c] || '').toString().trim();
      const strike = (fontLineRow[c] || '').toString().toLowerCase().includes('line-through');
      if (val && !strike) {
        addVehicleEntry(hTitle, val);
      }
    }
  }

  // Scan all tour columns for any active scheduled company tour
  for (let c = 2; c < row.length; c++) {
    const headerTitle = normalizeHeader(headerRow[c]);
    if (!isTourColumn(c, headerTitle)) continue;

    const cellText = (row[c] || '').toString().trim();
    const lowerCell = cellText.toLowerCase();
    if (
      lowerCell.includes('closed') ||
      lowerCell.includes('canceled') ||
      lowerCell.includes('cancelled')
    ) {
      continue;
    }

    const isStrikethrough = (fontLineRow[c] || '')
      .toString()
      .toLowerCase()
      .includes('line-through');
    if (isStrikethrough) {
      continue;
    }

    const cellBg = (bgRow[c] || '').toString();
    const statusColor = classifyCellColor(cellBg);
    if (statusColor === 'closed') {
      continue;
    }

    const hNext1 = normalizeHeader(headerRow[c + 1]).toLowerCase();
    const hNext2 = normalizeHeader(headerRow[c + 2]).toLowerCase();
    const hNext3 = normalizeHeader(headerRow[c + 3]).toLowerCase();
    const isShipBookingBlock =
      hNext1 === 'forecast' && hNext2 === 'on board' && hNext3 === 'shop';

    let guestCount = 0;
    let shipName: string | null = null;
    const commentCols1Based: number[] = [c + 1, c + 2];
    const noteCols0Based: number[] = [c, c + 1];

    if (isShipBookingBlock) {
      const onBoard = parseIntOrZero(row[c + 2]);
      const shop = parseIntOrZero(row[c + 3]);
      guestCount = onBoard + shop;

      commentCols1Based.push(c + 3, c + 4);
      noteCols0Based.push(c + 2, c + 3);

      const maxShipCol = Math.max(c + 8, SHIP_COL_BB_INDEX);
      for (let s = c + 4; s <= Math.min(maxShipCol, headerRow.length - 1); s++) {
        if (normalizeHeader(headerRow[s]).toLowerCase() === 'ship' || s === SHIP_COL_BB_INDEX) {
          const val = normalizeShipCellValue((row[s] || '').toString());
          if (val) {
            shipName = val;
            commentCols1Based.push(s + 1);
            noteCols0Based.push(s);
            break;
          }
        }
      }
    } else {
      guestCount = parseIntOrZero(row[c + 1]);
      if (guestCount === 0 && cellText) {
        const inlinePax = /(\d+)\s*pax\b/i.exec(cellText);
        if (inlinePax && inlinePax[1]) {
          guestCount = parseIntOrZero(inlinePax[1]);
        }
      }
    }

    const hasYellowOrConfirmed = statusColor === 'pending' || statusColor === 'confirmed';
    if (!cellText && !hasYellowOrConfirmed && guestCount === 0) {
      continue;
    }

    const uniqueCommentCols = new Set(commentCols1Based);
    const matchedComments = comments.filter(
      (com) =>
        com.row === sheetRowNumber &&
        com.column !== null &&
        uniqueCommentCols.has(com.column)
    );

    const commentsList: ThreadedComment[] = matchedComments.map((com) => ({
      author: com.author || 'Office',
      content: com.comment,
      cell: com.cell,
      replies: Array.isArray(com.replies) ? com.replies : [],
    }));

    const uniqueNoteCols = Array.from(new Set(noteCols0Based));
    const classicNotes = uniqueNoteCols
      .map((idx) => (noteRow[idx] || '').toString().trim())
      .filter((n) => n.length > 0);
    const combinedClassicNote = Array.from(new Set(classicNotes)).join(' • ');

    const allNoteAndCommentText = [
      cellText,
      combinedClassicNote,
      ...commentsList.map((cm) => `${cm.content} ${cm.replies.map((r) => r.content).join(' ')}`),
    ].join(' ');

    if (!shipName) {
      shipName = detectShipInText(allNoteAndCommentText);
    }

    const vehicle = detectVehicleInText(allNoteAndCommentText);
    const meetingPoint = detectMeetingPoint(allNoteAndCommentText, headerTitle, shipName);
    const { tourCategory } = inferTourCategory(headerTitle, allNoteAndCommentText);
    const isCharter = c >= 44;

    const parsedTime =
      parseTimeRangeFromText(cellText) ??
      parseTimeRangeFromText(combinedClassicNote) ??
      parseTimeRangeFromText(headerTitle);

    const defaultDur =
      tourCategory === 'hill_hike'
        ? 300
        : tourCategory === 'coffee_snowshoe'
          ? 270
          : tourCategory === 'easy_snowshoe'
            ? 150
            : 180;

    const startMinutes = parsedTime?.startMinutes ?? null;
    const endMinutes =
      parsedTime?.endMinutes ??
      (startMinutes !== null ? startMinutes + defaultDur : null);

    const displayTourName = buildDisplayTourName({
      headerTitle,
      cellText: allNoteAndCommentText,
      shipName,
      tourCategory,
    });

    const assignedGuides = extractAssignedGuidesFromCell(cellText, staffFirstNamesLower);
    const isMine = cellContainsGuideInitials(cellText, myInitials);

    const startLabel = parsedTime?.startLabel ?? null;
    if (vehicle) {
      const guideTag = assignedGuides.length > 0 ? assignedGuides.join('/') : displayTourName.slice(0, 18);
      const timeTag = startLabel ? ` (${startLabel})` : '';
      addVehicleEntry(vehicle, `${guideTag}${timeTag}`);
    }

    tours.push({
      id: `${sheetRowNumber}-${c}`,
      tourName: displayTourName,
      sheetColumnHeader: headerTitle,
      tourCategory,
      guestCount,
      assignedGuides,
      isMine,
      vehicle,
      meetingPoint,
      shipName,
      startTimeLabel: startLabel,
      endTimeLabel:
        parsedTime?.endLabel ?? (endMinutes !== null ? formatHHMM(endMinutes) : null),
      startMinutes,
      endMinutes,
      statusColor,
      isCharter,
      rawText: cellText,
      cellNote: combinedClassicNote || null,
      commentsList,
    });
  }

  tours.sort((a, b) => {
    const aMin = a.startMinutes ?? 9999;
    const bMin = b.startMinutes ?? 9999;
    return aMin - bMin;
  });

  const vehicles: CompanyVehicleItem[] = Array.from(vehicleMap.entries()).map(
    ([vehicle, entries]) => ({
      vehicle,
      summary: entries.join(' · '),
    })
  );

  return {
    tours,
    vehicles,
    rentalCenterRaw,
    guidesOnDutyRaw,
  };
}