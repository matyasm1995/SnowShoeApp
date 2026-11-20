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
const STORAGE_KEY_GUIDE_PROFILE = 'pref:guide_profile_v1';

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
  statusColor: TourColorStatus;
  cellBgHex: string;
  isStrikethrough: boolean;
}

export type DutyStatusType = 'tour' | 'base' | 'day_off';

export interface DutyStatus {
  type: DutyStatusType;
  title: string;
  detail: string;
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

export async function downloadSchedule(): Promise<SyncPayload> {
  const response = await fetch(CONFIG.sheet.scriptUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json.status !== 'success' || !json.values) {
    throw new Error(json.message || 'Malformed spreadsheet response.');
  }

  const syncedAt = new Date().toISOString();
  const managerNotes = Array.isArray(json.managerNotes) ? (json.managerNotes as string[][]) : [];
  const backgrounds = Array.isArray(json.backgrounds) ? (json.backgrounds as string[][]) : [];
  const fontLines = Array.isArray(json.fontLines) ? (json.fontLines as string[][]) : [];

  await AsyncStorage.setItem(STORAGE_KEY_RAW_MATRIX, JSON.stringify(json.values));
  await AsyncStorage.setItem(STORAGE_KEY_NOTES_MATRIX, JSON.stringify(json.notes || []));
  await AsyncStorage.setItem(STORAGE_KEY_COMMENTS_LIST, JSON.stringify(json.comments || []));
  await AsyncStorage.setItem(STORAGE_KEY_MANAGER_NOTES, JSON.stringify(managerNotes));
  await AsyncStorage.setItem(STORAGE_KEY_BG_COLORS, JSON.stringify(backgrounds));
  await AsyncStorage.setItem(STORAGE_KEY_FONT_LINES, JSON.stringify(fontLines));
  await AsyncStorage.setItem(STORAGE_KEY_SYNC_TIME, syncedAt);

  return {
    values: json.values,
    notes: json.notes || [],
    comments: json.comments || [],
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

  const singleRegex = /(?:^|\s|at\s+)(\d{1,2}):\s*(\d{2})\b/i;
  const singleMatch = singleRegex.exec(text);
  if (singleMatch) {
    const sh = parseInt(singleMatch[1] ?? '', 10);
    const sm = parseInt(singleMatch[2] ?? '', 10);
    if (sh >= 7 && sh <= 23 && sm >= 0 && sm <= 59) {
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

  if (combined.includes('ski')) {
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
  return null;
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

function buildDisplayTourName(params: {
  headerTitle: string;
  cellText: string;
  shipName: string | null;
  tourCategory: TourCategory;
}): string {
  const { headerTitle, cellText, shipName, tourCategory } = params;
  const lowerHeader = headerTitle.toLowerCase();
  const activityLabel = activityDisplayLabel(tourCategory);

  const isGenericHeader =
    lowerHeader.startsWith('group booking') ||
    lowerHeader.startsWith('multyday');

  if (isGenericHeader) {
    if (shipName) {
      return `${shipName} · ${activityLabel}`;
    }
    const partnerMatch = /\b(best arctic|baraka|delta of scandinavia|intrepid|nordic tours|s\.h\.tours)\b/i.exec(
      cellText
    );
    if (partnerMatch) {
      return `${partnerMatch[0]} · ${activityLabel}`;
    }
    return `${activityLabel} (${headerTitle})`;
  }

  if (shipName && !lowerHeader.includes(shipName.toLowerCase())) {
    return `${headerTitle} (${shipName})`;
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

function isDayOffMarker(cellLower: string, guideInitialsLower: string): boolean {
  if (!cellLower) return false;
  if (guideInitialsLower && cellLower.split(/[^a-z0-9]+/).includes(guideInitialsLower)) {
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

export function calculateDutyStatus(
  matrix: string[][],
  targetRowIdx: number,
  profile: GuideProfile,
  assignmentsCount: number
): DutyStatus {
  if (assignmentsCount > 0) {
    return {
      type: 'tour',
      title: `${assignmentsCount} Tour${assignmentsCount > 1 ? 's' : ''} Assigned`,
      detail: 'Scheduled in field operations today.',
    };
  }

  if (targetRowIdx === -1 || !matrix || matrix.length < 2) {
    return {
      type: 'base',
      title: 'No Tours Scheduled',
      detail: 'Check dispatch for base duties.',
    };
  }

  const headerRow = matrix[1] || [];
  const nameColIdx = findStaffColumnIndex(headerRow, profile);

  if (nameColIdx === -1) {
    return profile.contractType === 'full-time'
      ? { type: 'base', title: 'Base / Workshop Duty', detail: 'No tour assigned. On duty at shop/base.' }
      : { type: 'day_off', title: 'Day Off', detail: 'No tours or shift assigned today.' };
  }

  const rawCell = (matrix[targetRowIdx]?.[nameColIdx] || '').toString().trim();
  const cellLower = rawCell.toLowerCase();
  const initialsLower = profile.initials.trim().toLowerCase();

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

  if (isDayOffMarker(cellLower, initialsLower)) {
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

    const words = lowerCell.split(/[^a-z0-9]+/);
    if (!cleanCode || !words.includes(cleanCode)) continue;

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
          const val = (row[s] || '').toString().trim();
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