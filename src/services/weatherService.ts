import { CONFIG } from '../config';
import type { GeoPoint } from '../data/routes';
import { loadJson, saveJson } from './persistence';

export const MET_USER_AGENT = CONFIG.weather.userAgent;

const FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const REQUEST_TIMEOUT_MS = 12000;

export interface HourlyForecastItem {
  time: string;
  airTemperatureC: number;
  windSpeedMs: number;
  windGustMs: number;
  windFromDirectionDeg: number | null;
  symbolCode: string | null;
  precipitationMm: number;
  cloudCoverPct: number;
}

export interface ForecastResult {
  current: HourlyForecastItem;
  hourly: HourlyForecastItem[];
  fetchedAt: string;
  fromCache: boolean;
  point: GeoPoint;
}

export class ForecastUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForecastUnavailableError';
  }
}

function cacheKey(point: GeoPoint): string {
  return `forecast:v3:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}:${Math.round(point.elevationMeters)}`;
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
    };
  };
}

function parseHourly(timeseries: RawTimeseriesEntry[]): HourlyForecastItem[] {
  const now = Date.now();
  return timeseries
    .filter((entry) => {
      const t = Date.parse(entry.time);
      return Number.isFinite(t) && t >= now - 3600000 && t <= now + 48 * 3600000;
    })
    .map((entry) => {
      const details = entry.data?.instant?.details ?? {};
      const nextHour = entry.data?.next_1_hours;
      const next6Hour = entry.data?.next_6_hours;

      return {
        time: entry.time,
        airTemperatureC: details.air_temperature ?? 0,
        windSpeedMs: details.wind_speed ?? 0,
        windGustMs: details.wind_gust ?? 0,
        windFromDirectionDeg: details.wind_from_direction ?? null,
        symbolCode: nextHour?.summary?.symbol_code ?? next6Hour?.summary?.symbol_code ?? null,
        precipitationMm: nextHour?.details?.precipitation_amount ?? 0,
        cloudCoverPct: Math.round(details.cloud_area_fraction ?? 0),
      };
    });
}

export async function fetchForecast(point: GeoPoint): Promise<ForecastResult> {
  const key = cacheKey(point);
  const params = new URLSearchParams({
    lat: point.latitude.toFixed(4),
    lon: point.longitude.toFixed(4),
    altitude: String(Math.round(point.elevationMeters)),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': MET_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ForecastUnavailableError(`MET Norway error ${response.status}`);
    }

    const data = (await response.json()) as {
      properties?: { timeseries?: RawTimeseriesEntry[] };
    };
    const series = data?.properties?.timeseries ?? [];
    const hourly = parseHourly(series);

    if (hourly.length === 0) {
      throw new ForecastUnavailableError('No forecast series available.');
    }

    const current = hourly[0]!;
    const fetchedAt = new Date().toISOString();

    await saveJson(key, { fetchedAt, hourly });

    return {
      current,
      hourly,
      fetchedAt,
      fromCache: false,
      point,
    };
  } catch {
    const cached = await loadJson<{ fetchedAt: string; hourly: HourlyForecastItem[] }>(key);
    if (cached && cached.hourly && cached.hourly.length > 0) {
      return {
        current: cached.hourly[0]!,
        hourly: cached.hourly,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
        point,
      };
    }
    throw new ForecastUnavailableError('No forecast available offline.');
  } finally {
    clearTimeout(timer);
  }
}