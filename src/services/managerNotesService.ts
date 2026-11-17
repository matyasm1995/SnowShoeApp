import { loadJson, saveJson } from './persistence';
import { osloDateKey } from '../utils/format';

const DISMISSED_KEY = 'notes:dismissed:v1';

export type ManagerNoteLevel = 'critical' | 'warning' | 'info';

export interface ManagerNoteItem {
  id: string;
  dateLabel: string;
  isoDate: string | null;
  note: string;
  level: ManagerNoteLevel;
}

function parseNoteDateToIso(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;

  // DD.MM.YYYY (e.g. 17.11.2026)
  const euMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(clean);
  if (euMatch && euMatch[1] && euMatch[2] && euMatch[3]) {
    const dd = euMatch[1].padStart(2, '0');
    const mm = euMatch[2].padStart(2, '0');
    return `${euMatch[3]}-${mm}-${dd}`;
  }

  // YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return osloDateKey(parsed);
  }

  return null;
}

function normalizeLevel(raw: string): ManagerNoteLevel {
  const lower = raw.trim().toLowerCase();
  if (lower.includes('crit') || lower.includes('high') || lower.includes('urgent')) {
    return 'critical';
  }
  if (lower.includes('warn') || lower.includes('med')) {
    return 'warning';
  }
  return 'info';
}

function isRowActive(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  return lower === 'yes' || lower === 'true' || lower === '1' || lower === 'y';
}

export function parseManagerNotes(
  matrix: string[][] | undefined,
  referenceDate: Date = new Date()
): ManagerNoteItem[] {
  if (!matrix || matrix.length < 2) return [];

  const headerRow = (matrix[0] || []).map((c) => (c ?? '').toString().trim().toLowerCase());
  const dateCol = Math.max(0, headerRow.findIndex((h) => h.includes('date')));
  const noteCol = Math.max(1, headerRow.findIndex((h) => h.includes('note')));
  const levelCol = Math.max(2, headerRow.findIndex((h) => h.includes('level')));
  const activeCol = Math.max(3, headerRow.findIndex((h) => h.includes('active')));

  const todayKey = osloDateKey(referenceDate);
  const items: ManagerNoteItem[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const rawDate = (row[dateCol] ?? '').toString().trim();
    const rawNote = (row[noteCol] ?? '').toString().trim();
    const rawLevel = (row[levelCol] ?? '').toString().trim();
    const rawActive = (row[activeCol] ?? '').toString().trim();

    if (!rawNote || !isRowActive(rawActive)) continue;

    const isoDate = parseNoteDateToIso(rawDate);
    if (isoDate && isoDate > todayKey) {
      // Future-dated note not yet active
      continue;
    }

    const level = normalizeLevel(rawLevel);
    const id = `${isoDate ?? 'nodate'}_${level}_${rawNote.slice(0, 40)}`;

    items.push({
      id,
      dateLabel: rawDate || todayKey,
      isoDate,
      note: rawNote,
      level,
    });
  }

  const weight: Record<ManagerNoteLevel, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return items.sort((a, b) => weight[a.level] - weight[b.level]);
}

export async function loadDismissedNoteIds(): Promise<string[]> {
  const stored = await loadJson<string[]>(DISMISSED_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function dismissManagerNote(id: string): Promise<string[]> {
  const current = await loadDismissedNoteIds();
  if (current.includes(id)) return current;
  const next = [...current, id].slice(-100);
  await saveJson(DISMISSED_KEY, next);
  return next;
}