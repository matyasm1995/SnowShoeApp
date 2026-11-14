import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config';
import type { TourCategory } from '../data/routes';

const STORAGE_KEY_RAW_MATRIX = 'cache:schedule_matrix_v8';
const STORAGE_KEY_NOTES_MATRIX = 'cache:schedule_notes_v8';
const STORAGE_KEY_COMMENTS_LIST = 'cache:schedule_comments_v8';
const STORAGE_KEY_SYNC_TIME = 'cache:schedule_synced_at';
const STORAGE_KEY_GUIDE_PROFILE = 'pref:guide_profile_v1';

export type ContractType = 'full-time' | 'part-time';

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
  shipName: string | null;
  startTimeLabel: string | null;
  endTimeLabel: string | null;
  startMinutes: number | null;
  endMinutes: number | null;
  cellNote: string | null;
  commentsList: ThreadedComment[];
  isCharter: boolean;
  rawText: string;
}

export type DutyStatusType = 'tour' | 'base' | 'day_off';

export interface DutyStatus {
  type: DutyStatusType;
  title: string;
  detail: string;
}

export interface SyncPayload {
  values: string[][];
  notes: string[][];
  comments: SheetCommentItem[];
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
  await AsyncStorage.setItem(STORAGE_KEY_RAW_MATRIX, JSON.stringify(json.values));
  await AsyncStorage.setItem(STORAGE_KEY_NOTES_MATRIX, JSON.stringify(json.notes || []));
  await AsyncStorage.setItem(STORAGE_KEY_COMMENTS_LIST, JSON.stringify(json.comments || []));
  await AsyncStorage.setItem(STORAGE_KEY_SYNC_TIME, syncedAt);

  return {
    values: json.values,
    notes: json.notes || [],
    comments: json.comments || [],
    syncedAt,
    fromCache: false,
  };
}

export async function getCachedSchedule(): Promise<SyncPayload | null> {
  try {
    const rawVal = await AsyncStorage.getItem(STORAGE_KEY_RAW_MATRIX);
    const rawNotes = await AsyncStorage.getItem(STORAGE_KEY_NOTES_MATRIX);
    const rawComments = await AsyncStorage.getItem(STORAGE_KEY_COMMENTS_LIST);
    const syncedAt = await AsyncStorage.getItem(STORAGE_KEY_SYNC_TIME);
    if (!rawVal) return null;

    return {
      values: JSON.parse(rawVal) as string[][],
      notes: rawNotes ? (JSON.parse(rawNotes) as string[][]) : [],
      comments: rawComments ? (JSON.parse(rawComments) as SheetCommentItem[]) : [],
      syncedAt: syncedAt || new Date().toISOString(),
      fromCache: true,
    };
  } catch {
    return null;
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

function inferTourCategory(headerTitle: string, cellText: string): {
  activity: 'snowshoe' | 'ski' | 'fatbike' | 'hiking';
  tourCategory: TourCategory;
} {
  const combined = `${headerTitle} ${cellText}`.toLowerCase();

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
  let staffStartCol = 69;
  for (let c = 50; c < headerRow.length; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('caravelle #4')) {
      staffStartCol = c + 1;
      break;
    }
  }

  let nameColIdx = -1;
  const targetName = profile.fullName.trim().toLowerCase();

  for (let c = staffStartCol; c < headerRow.length; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (targetName && h.includes(targetName)) {
      nameColIdx = c;
      break;
    }
  }

  if (nameColIdx === -1) {
    return profile.contractType === 'full-time'
      ? { type: 'base', title: 'Base / Workshop Duty', detail: 'No tour assigned. On duty at shop/base.' }
      : { type: 'day_off', title: 'Day Off', detail: 'No tours or shift assigned today.' };
  }

  const cellText = (matrix[targetRowIdx]?.[nameColIdx] || '').toString().trim().toLowerCase();
  const isEmpty = cellText.length === 0;

  if (profile.contractType === 'full-time') {
    if (isEmpty) {
      return {
        type: 'base',
        title: 'Base / Workshop Duty',
        detail: 'On duty at Tromsø Outdoor (Rental Centre/Workshop). No tours.',
      };
    }
    return {
      type: 'day_off',
      title: 'Day Off / Leave',
      detail: `Marked in shift roster: "${cellText}". Enjoy your day off!`,
    };
  }

  if (isEmpty) {
    return {
      type: 'day_off',
      title: 'Day Off',
      detail: 'No shift scheduled today.',
    };
  }
  return {
    type: 'base',
    title: 'Scheduled on Duty',
    detail: `Roster note: "${cellText}".`,
  };
}

export function parseGuideAssignments(
  matrix: string[][],
  notes: string[][],
  comments: SheetCommentItem[],
  guideCode: string,
  targetDate: Date = new Date()
): { assignments: GuideAssignment[]; targetRowIdx: number } {
  if (!matrix || matrix.length < 3) return { assignments: [], targetRowIdx: -1 };

  const dayNumber = targetDate.getDate();
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  const targetMonth = monthNames[targetDate.getMonth()] ?? '';

  let currentMonth = '';
  let targetRowIdx = -1;

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
      targetRowIdx = r;
      break;
    }
  }

  if (targetRowIdx === -1) {
    for (let r = 0; r < matrix.length; r++) {
      const col1Day = parseInt((matrix[r]?.[1] || '').toString().trim(), 10);
      if (col1Day === dayNumber) {
        targetRowIdx = r;
        break;
      }
    }
  }

  if (targetRowIdx === -1) return { assignments: [], targetRowIdx: -1 };

  const headerRow = matrix[1] || [];
  const row = matrix[targetRowIdx] || [];
  const noteRow = notes[targetRowIdx] || [];
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

      for (let s = c + 4; s <= Math.min(c + 6, headerRow.length - 1); s++) {
        if (normalizeHeader(headerRow[s]).toLowerCase() === 'ship') {
          const val = (row[s] || '').toString().trim();
          shipName = val || null;
          commentCols1Based.push(s + 1);
          noteCols0Based.push(s);
          break;
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

    let vehicle: string | null = null;
    if (/minibus/i.test(cellText)) vehicle = 'Minibus';
    else if (/caravelle/i.test(cellText)) vehicle = 'Caravelle';

    const { activity, tourCategory } = inferTourCategory(headerTitle, cellText);
    const isCharter = c >= 44;

    const parsedTime =
      parseTimeRangeFromText(cellText) ?? parseTimeRangeFromText(headerTitle);

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

    assignments.push({
      dateString: targetDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      guideCode,
      tourName: headerTitle || 'Scheduled Tour',
      activity,
      tourCategory,
      guestCount,
      vehicle,
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
    });
  }

  return { assignments, targetRowIdx };
}