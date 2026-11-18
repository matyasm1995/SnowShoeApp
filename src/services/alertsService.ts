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
      return { color: '#FACC15', bg: '#422006' };
    case 3:
      return { color: '#FB923C', bg: '#431407' };
    case 4:
      return { color: '#EF4444', bg: '#450A0A' };
    case 5:
      return { color: '#F43F5E', bg: '#4C0519' };
    default:
      return { color: '#A1A1AA', bg: '#18181B' };
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

interface RawMetAlertFeature {
  id?: string;
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
  };
}

export async function fetchWeatherAlerts(point: GeoPoint): Promise<WeatherAlertItem[]> {
  if (await isPreviewAlertsEnabled()) {
    return [
      {
        id: 'preview-gale-1',
        event: 'Gale & Blowing Snow (Preview)',
        severity: 'Yellow · Moderate',
        headline: 'Strong ENE gusts 20–24 m/s on exposed ridges and Kvaløya bridge.',
        instruction: 'Allow extra driving time and carry goggles on exposed tours.',
      },
    ];
  }

  const key = `alerts:met:v1:${point.latitude.toFixed(2)}:${point.longitude.toFixed(2)}`;
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

    const items: WeatherAlertItem[] = features.map((f, idx) => {
      const p = f.properties ?? {};
      const event = p.eventAwarenessName || p.event || 'Weather Warning';
      const severity = p.riskMatrixColor || p.severity || 'Advisory';
      const headline = p.title || p.name || p.description || p.area || event;
      const item: WeatherAlertItem = {
        id: f.id || p.id || `alert-${idx}`,
        event,
        severity,
        headline,
      };
      if (p.instruction) {
        item.instruction = p.instruction;
      }
      return item;
    });

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
        '[Preview Mode] Fresh wind slabs above 350 m on leeward slopes. Stick to conservative ridges below 30°.',
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