import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONFIG } from '../config';
import type { GeoPoint } from '../data/routes';
import { osloDateKey } from '../utils/format';
import { loadJson, saveJson } from './persistence';

const METALERTS_URL = 'https://api.met.no/weatherapi/metalerts/2.0/current.json';
const VARSOM_TROMSO_URL =
  'https://api01.nve.no/hydrology/forecast/avalanche/v6.3.0/api/AvalancheWarningByRegion/Detail';
const TROMSO_REGION_ID = 3011;
const REQUEST_TIMEOUT_MS = 10000;
const STORAGE_KEY_PREVIEW_ALERTS = 'pref:preview_alerts_v1';

export interface WeatherAlertItem {
  id: string;
  event: string;
  severity: string;
  headline: string;
  instruction?: string;
  validFromIso: string;
  validToIso: string;
  validRangeLabel: string;
}

export interface AvalancheWarning {
  dangerLevel: number;
  dangerLevelName: string;
  exposedHeight1: number;
  mainText: string;
  problems: string[];
}

export function avalancheDangerColor(level: number): { color: string; bg: string } {
  switch (level) {
    case 1:
      return { color: '#4ADE80', bg: '#052E16' };
    case 2:
      return { color: '#FACC15', bg: '#3A2004' };
    case 3:
      return { color: '#FB923C', bg: '#2E1508' };
    case 4:
      return { color: '#EF4444', bg: '#3B0D0D' };
    case 5:
      return { color: '#F43F5E', bg: '#3B0D18' };
    default:
      return { color: '#94A3B8', bg: '#16191F' };
  }
}

export const avalancheBadgeColors = avalancheDangerColor;

async function isPreviewAlertsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_PREVIEW_ALERTS);
    return val === 'true';
  } catch {
    return false;
  }
}

function cleanMetAlertHeadline(titleOrArea: string): string {
  // Strip raw appended ISO timestamps like ", 2026-11-19T05:20:00+00:00, 2026-11-19T18:00:00+00:00"
  return titleOrArea
    .replace(/,\s*\d{4}-\d{2}-\d{2}T[\d:+]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCleanAlertRange(fromIso: string, toIso: string): string {
  const dFrom = new Date(fromIso);
  const dTo = new Date(toIso);
  if (Number.isNaN(dFrom.getTime()) || Number.isNaN(dTo.getTime())) return '';

  const dayFrom = dFrom.toLocaleDateString('en-GB', {
    timeZone: 'Europe/Oslo',
    day: 'numeric',
    month: 'short',
  });
  const tFrom = dFrom.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
  });
  const tTo = dTo.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${dayFrom} ${tFrom}–${tTo}`;
}

interface RawMetAlertFeature {
  id?: string;
  when?: {
    interval?: [string, string];
  };
  properties?: {
    id?: string;
    event?: string;
    eventAwarenessName?: string;
    severity?: string;
    riskMatrixColor?: string;
    title?: string;
    name?: string;
    description?: string;
    instruction?: string;
    area?: string;
    validFrom?: string;
    validTo?: string;
  };
}

export async function fetchWeatherAlerts(
  point: GeoPoint,
  targetDate: Date = new Date()
): Promise<WeatherAlertItem[]> {
  if (await isPreviewAlertsEnabled()) {
    return [
      {
        id: 'preview-gale-1',
        event: 'Gale Warning (Preview)',
        severity: 'Yellow · Moderate',
        headline: 'Parts of Troms, Finnmark and Vesterålen',
        instruction: 'Strong ENE gusts 20–24 m/s on Kvaløya ridges.',
        validFromIso: new Date().toISOString(),
        validToIso: new Date(Date.now() + 86400000).toISOString(),
        validRangeLabel: 'Active today',
      },
    ];
  }

  const key = `alerts:met:v2:${point.latitude.toFixed(2)}:${point.longitude.toFixed(2)}`;
  const params = new URLSearchParams({
    lat: point.latitude.toFixed(4),
    lon: point.longitude.toFixed(4),
    lang: 'en',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${METALERTS_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': CONFIG.weather.userAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`MetAlerts HTTP ${res.status}`);
    }

    const json = (await res.json()) as { features?: RawMetAlertFeature[] };
    const features = Array.isArray(json.features) ? json.features : [];

    const targetDayKey = osloDateKey(targetDate);

    const items: WeatherAlertItem[] = [];

    for (let idx = 0; idx < features.length; idx++) {
      const f = features[idx]!;
      const p = f.properties ?? {};
      const interval = f.when?.interval;

      const fromIso = interval?.[0] || p.validFrom || new Date().toISOString();
      const toIso = interval?.[1] || p.validTo || new Date(Date.now() + 86400000).toISOString();

      const dFrom = new Date(fromIso);
      const dTo = new Date(toIso);
      const fromDayKey = !Number.isNaN(dFrom.getTime()) ? osloDateKey(dFrom) : targetDayKey;
      const toDayKey = !Number.isNaN(dTo.getTime()) ? osloDateKey(dTo) : targetDayKey;

      // Only include alert if targetDate falls within its active dates
      if (targetDayKey < fromDayKey || targetDayKey > toDayKey) {
        continue;
      }

      const event = p.eventAwarenessName || p.event || 'Weather Warning';
      const severity = p.riskMatrixColor || p.severity || 'Advisory';
      const rawText = p.title || p.name || p.area || p.description || event;
      const headline = cleanMetAlertHeadline(rawText);

      const item: WeatherAlertItem = {
        id: f.id || p.id || `alert-${idx}`,
        event,
        severity,
        headline,
        validFromIso: fromIso,
        validToIso: toIso,
        validRangeLabel: formatCleanAlertRange(fromIso, toIso),
      };

      if (p.instruction) {
        item.instruction = cleanMetAlertHeadline(p.instruction);
      }

      items.push(item);
    }

    await saveJson(key, items);
    return items;
  } catch {
    const cached = await loadJson<WeatherAlertItem[]>(key);
    return Array.isArray(cached) ? cached : [];
  } finally {
    clearTimeout(timer);
  }
}

interface RawVarsomProblem {
  AvalancheProblemName?: string;
  AvalancheProblemTypeName?: string;
}

interface RawVarsomWarning {
  DangerLevel?: string | number;
  DangerLevelName?: string;
  ExposedHeight1?: number;
  MainText?: string;
  AvalancheProblems?: RawVarsomProblem[];
}

export async function fetchTromsoAvalanche(
  date: Date = new Date()
): Promise<AvalancheWarning | null> {
  if (await isPreviewAlertsEnabled()) {
    return {
      dangerLevel: 3,
      dangerLevelName: 'Considerable (Preview)',
      exposedHeight1: 350,
      mainText:
        '[Preview Mode] Fresh wind slabs on leeward ridges above 350 m. Stick to conservative terrain <30°.',
      problems: ['Wind drifted snow', 'Persistent weak layer'],
    };
  }

  const dayKey = osloDateKey(date);
  const key = `alerts:avalanche:v1:${TROMSO_REGION_ID}:${dayKey}`;
  const url = `${VARSOM_TROMSO_URL}/${TROMSO_REGION_ID}/2/${dayKey}/${dayKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Varsom HTTP ${res.status}`);
    }

    const data = (await res.json()) as RawVarsomWarning[];
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;

    const dangerLevel = Number(first.DangerLevel ?? 0);
    if (!Number.isFinite(dangerLevel) || dangerLevel <= 0) {
      await saveJson(key, null);
      return null;
    }

    const problems = Array.isArray(first.AvalancheProblems)
      ? first.AvalancheProblems.map(
          (p) => p.AvalancheProblemTypeName || p.AvalancheProblemName || ''
        ).filter((s) => s.length > 0)
      : [];

    const parsed: AvalancheWarning = {
      dangerLevel,
      dangerLevelName: first.DangerLevelName || '',
      exposedHeight1: Number(first.ExposedHeight1 ?? 0),
      mainText: first.MainText || '',
      problems,
    };

    await saveJson(key, parsed);
    return parsed;
  } catch {
    return await loadJson<AvalancheWarning | null>(key);
  } finally {
    clearTimeout(timer);
  }
}