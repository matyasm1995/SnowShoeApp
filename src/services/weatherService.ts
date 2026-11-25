import { Platform } from 'react-native';

import { CONFIG } from '../config';
import type { GeoPoint } from '../data/routes';
import type { WeatherPoint } from '../data/weatherSpots';
import { formatClock, osloDateKey } from '../utils/format';
import { loadJson, saveJson } from './persistence';

export const MET_USER_AGENT = CONFIG.weather.userAgent;

const FORECAST_URL =
  Platform.OS === 'web'
    ? '/api/forecast'
    : 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_FORECAST_DAYS = 10;

export interface HourlyForecastItem {
  time: string;
  airTemperatureC: number;
  windSpeedMs: number;
  windGustMs: number;
  windFromDirectionDeg: number | null;
  symbolCode: string | null;
  precipitationMm: number;
  cloudCoverPct: number;
  stepHours: 1 | 6;
}

export interface ForecastResult {
  current: HourlyForecastItem;
  hourly: HourlyForecastItem[];
  fetchedAt: string;
  fromCache: boolean;
  point: GeoPoint;
}

export interface ForecastWindowSummary {
  hasData: boolean;
  isExtended6h: boolean;
  repHour: HourlyForecastItem | null;
  peakWindMs: number;
  peakGustMs: number;
  peakTime: string;
  dirDeg: number | null;
  windowLabel: string;
  unavailableReason: 'loading' | 'past' | 'beyond_range' | null;
}

export class ForecastUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForecastUnavailableError';
  }
}

function cacheKey(point: WeatherPoint): string {
  const altKey =
    point.elevationMeters !== undefined &&
    point.elevationMeters !== null &&
    Number.isFinite(point.elevationMeters)
      ? String(Math.round(point.elevationMeters))
      : 'auto';
  return `forecast:v4:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}:${altKey}`;
}

interface RawTimeseriesEntry {
  time: string;
  data?: {
    instant?: {
      details?: {
        air_temperature?: number;
        wind_speed?: number;
        wind_gust?: number;
        wind_from_direction?: number;
        cloud_area_fraction?: number;
      };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_12_hours?: {
      summary?: { symbol_code?: string };
    };
  };
}

function parseTimeseries(timeseries: RawTimeseriesEntry[]): HourlyForecastItem[] {
  const now = Date.now();
  const maxMs = now + MAX_FORECAST_DAYS * 24 * 3600000;

  return timeseries
    .filter((entry) => {
      const t = Date.parse(entry.time);
      return Number.isFinite(t) && t >= now - 3600000 && t <= maxMs;
    })
    .map((entry) => {
      const details = entry.data?.instant?.details ?? {};
      const nextHour = entry.data?.next_1_hours;
      const next6Hour = entry.data?.next_6_hours;
      const next12Hour = entry.data?.next_12_hours;
      const isHourly = Boolean(nextHour);

      return {
        time: entry.time,
        airTemperatureC: details.air_temperature ?? 0,
        windSpeedMs: details.wind_speed ?? 0,
        windGustMs: details.wind_gust ?? 0,
        windFromDirectionDeg: details.wind_from_direction ?? null,
        symbolCode:
          nextHour?.summary?.symbol_code ??
          next6Hour?.summary?.symbol_code ??
          next12Hour?.summary?.symbol_code ??
          null,
        precipitationMm:
          nextHour?.details?.precipitation_amount ??
          next6Hour?.details?.precipitation_amount ??
          0,
        cloudCoverPct: Math.round(details.cloud_area_fraction ?? 0),
        stepHours: isHourly ? 1 : 6,
      };
    });
}

function getOsloMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

function formatMinutesLabel(minutes: number): string {
  const clamped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isItemOverlappingWindow(
  item: HourlyForecastItem,
  targetDateKey: string,
  startMin: number,
  endMin: number
): boolean {
  const d = new Date(item.time);
  if (Number.isNaN(d.getTime()) || osloDateKey(d) !== targetDateKey) return false;
  const m = getOsloMinutes(d);
  const stepMin = (item.stepHours ?? 1) * 60;
  return m + stepMin - 1 >= startMin && m <= endMin;
}

export function summarizeForecastWindow(
  hourly: HourlyForecastItem[] | undefined,
  dateKey: string,
  startMin: number | null,
  endMin: number | null
): ForecastWindowSummary {
  if (!hourly || hourly.length === 0) {
    return {
      hasData: false,
      isExtended6h: false,
      repHour: null,
      peakWindMs: 0,
      peakGustMs: 0,
      peakTime: '',
      dirDeg: null,
      windowLabel: '',
      unavailableReason: 'loading',
    };
  }

  const todayKey = osloDateKey(new Date());
  if (dateKey < todayKey) {
    return {
      hasData: false,
      isExtended6h: false,
      repHour: null,
      peakWindMs: 0,
      peakGustMs: 0,
      peakTime: '',
      dirDeg: null,
      windowLabel: 'Past date',
      unavailableReason: 'past',
    };
  }

  const dayItems: { item: HourlyForecastItem; date: Date; min: number }[] = [];
  for (const item of hourly) {
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime())) continue;
    if (osloDateKey(d) === dateKey) {
      dayItems.push({ item, date: d, min: getOsloMinutes(d) });
    }
  }

  if (dayItems.length === 0) {
    return {
      hasData: false,
      isExtended6h: false,
      repHour: null,
      peakWindMs: 0,
      peakGustMs: 0,
      peakTime: '',
      dirDeg: null,
      windowLabel: 'Beyond 9-day forecast',
      unavailableReason: 'beyond_range',
    };
  }

  let windowItems = dayItems;
  let targetMin = 720; // Midday default for future days without a tour
  let windowLabel = '';

  if (startMin !== null) {
    const end = endMin ?? startMin + 180;
    const winStart = Math.max(0, startMin - 30);
    const winEnd = Math.min(24 * 60, end + 30);
    targetMin = Math.round((startMin + end) / 2);

    const matched = dayItems.filter(({ item, min }) => {
      const stepMin = (item.stepHours ?? 1) * 60;
      return min + stepMin - 1 >= winStart && min <= winEnd;
    });

    if (matched.length > 0) {
      windowItems = matched;
      windowLabel = `${formatMinutesLabel(startMin)}–${formatMinutesLabel(end)}`;
    } else {
      // Tour hours on today already passed; show the earliest remaining hour on this date
      const firstRemaining = dayItems[0]!;
      windowItems = [firstRemaining];
      targetMin = firstRemaining.min;
      windowLabel = `From ${formatClock(firstRemaining.date)}`;
    }
  } else if (dateKey === todayKey) {
    const firstNow = dayItems[0]!;
    targetMin = firstNow.min;
    windowItems = dayItems;
    windowLabel = 'Now · Today';
  } else {
    const daytime = dayItems.filter(({ item, min }) => {
      const stepMin = (item.stepHours ?? 1) * 60;
      return min + stepMin - 1 >= 480 && min <= 1080; // 08:00–18:00
    });
    windowItems = daytime.length > 0 ? daytime : dayItems;
    targetMin = 720;
    windowLabel = 'Midday (~12:00)';
  }

  let repEntry = windowItems[0]!;
  let bestDiff = Infinity;
  let peakWindMs = 0;
  let peakGustMs = 0;
  let peakTime = '';
  let dirDeg: number | null = null;

  for (const entry of windowItems) {
    const step = entry.item.stepHours ?? 1;
    const centerMin = entry.min + (step === 6 ? 180 : 0);
    const diff = Math.abs(centerMin - targetMin);
    if (diff < bestDiff) {
      bestDiff = diff;
      repEntry = entry;
    }

    const gust = entry.item.windGustMs > 0 ? entry.item.windGustMs : entry.item.windSpeedMs;
    if (gust >= peakGustMs) {
      peakGustMs = gust;
      peakWindMs = entry.item.windSpeedMs;
      peakTime = formatClock(entry.date);
      dirDeg = entry.item.windFromDirectionDeg;
    }
  }

  const isExtended6h = (repEntry.item.stepHours ?? 1) === 6;
  if (isExtended6h && windowLabel) {
    windowLabel = `${windowLabel} · 6h outlook`;
  }

  return {
    hasData: true,
    isExtended6h,
    repHour: repEntry.item,
    peakWindMs,
    peakGustMs,
    peakTime,
    dirDeg,
    windowLabel,
    unavailableReason: null,
  };
}

export async function fetchForecast(point: WeatherPoint): Promise<ForecastResult> {
  const key = cacheKey(point);
  const params = new URLSearchParams({
    lat: point.latitude.toFixed(4),
    lon: point.longitude.toFixed(4),
  });

  const hasExplicitAlt =
    point.elevationMeters !== undefined &&
    point.elevationMeters !== null &&
    Number.isFinite(point.elevationMeters);

  if (hasExplicitAlt) {
    params.set('altitude', String(Math.round(point.elevationMeters!)));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (Platform.OS !== 'web') {
      headers['User-Agent'] = MET_USER_AGENT;
    }
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ForecastUnavailableError(`MET Norway error ${response.status}`);
    }

    const data = (await response.json()) as {
      geometry?: { coordinates?: number[] };
      properties?: { timeseries?: RawTimeseriesEntry[] };
    };
    const series = data?.properties?.timeseries ?? [];
    const hourly = parseTimeseries(series);

    if (hourly.length === 0) {
      throw new ForecastUnavailableError('No forecast series available.');
    }

    const apiAltitude = data?.geometry?.coordinates?.[2];
    const resolvedElevation = hasExplicitAlt
      ? Math.round(point.elevationMeters!)
      : typeof apiAltitude === 'number' && Number.isFinite(apiAltitude)
        ? Math.round(apiAltitude)
        : 0;

    const resolvedPoint: GeoPoint = {
      latitude: point.latitude,
      longitude: point.longitude,
      elevationMeters: resolvedElevation,
    };

    const current = hourly[0]!;
    const fetchedAt = new Date().toISOString();

    await saveJson(key, { fetchedAt, hourly, resolvedElevation });

    return {
      current,
      hourly,
      fetchedAt,
      fromCache: false,
      point: resolvedPoint,
    };
  } catch {
    const cached = await loadJson<{
      fetchedAt: string;
      hourly: HourlyForecastItem[];
      resolvedElevation?: number;
    }>(key);
    if (cached && cached.hourly && cached.hourly.length > 0) {
      const normalized = cached.hourly.map((h) => ({
        ...h,
        stepHours: (h.stepHours === 6 ? 6 : 1) as 1 | 6,
      }));
      const resolvedPoint: GeoPoint = {
        latitude: point.latitude,
        longitude: point.longitude,
        elevationMeters: hasExplicitAlt
          ? Math.round(point.elevationMeters!)
          : cached.resolvedElevation ?? 0,
      };
      return {
        current: normalized[0]!,
        hourly: normalized,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        point: resolvedPoint,
      };
    }
    throw new ForecastUnavailableError('No forecast available offline.');
  } finally {
    clearTimeout(timer);
  }
}
