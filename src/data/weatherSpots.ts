import {
  getRouteById,
  SANDNESSUNDBRUA_POINT,
  type GeoPoint,
} from './routes';
import { loadJson, saveJson } from '../services/persistence';

export interface WeatherPoint {
  latitude: number;
  longitude: number;
  elevationMeters?: number | null;
}

export interface WeatherSpot {
  id: string;
  name: string;
  subtitle?: string;
  point: WeatherPoint;
  summit: GeoPoint | null;
  showAvalanche: boolean;
  usesBridgeWarning: boolean;
  isCustom?: boolean;
}

const STORAGE_KEY_CUSTOM_SPOTS = 'pref:custom_weather_spots_v1';

const tverrRoute = getRouteById('tverrfjellet');
const rundRoute = getRouteById('rundfjellet');
const coffeeRoute = getRouteById('coffee-malangen');
const charlRoute = getRouteById('snowshoe-charlottenlund');

export const BUILTIN_WEATHER_SPOTS: readonly WeatherSpot[] = [
  {
    id: 'tverrfjellet',
    name: 'Tverrfjellet',
    subtitle: 'Hill Hike · Kattfjordeidet',
    point: tverrRoute.weatherPoint,
    summit: tverrRoute.summit,
    showAvalanche: true,
    usesBridgeWarning: true,
  },
  {
    id: 'rundfjellet',
    name: 'Rundfjellet',
    subtitle: 'Hill Hike · Kaldfjord North',
    point: rundRoute.weatherPoint,
    summit: rundRoute.summit,
    showAvalanche: true,
    usesBridgeWarning: true,
  },
  {
    id: 'coffee-hike',
    name: 'Coffee Hike',
    subtitle: "Malangen · Tove's Tradisjonsmat",
    point: coffeeRoute.weatherPoint,
    summit: null,
    showAvalanche: false,
    usesBridgeWarning: true,
  },
  {
    id: 'charlottenlund',
    name: 'Charlottenlund',
    subtitle: 'Ski · Fatbike · Snowshoe & Campfire',
    point: charlRoute.weatherPoint,
    summit: null,
    showAvalanche: false,
    usesBridgeWarning: false,
  },
  {
    id: 'kvaloya-bridge',
    name: 'Kvaløya Bridge',
    subtitle: 'Sandnessundbrua · Fv862 (41m)',
    point: SANDNESSUNDBRUA_POINT,
    summit: null,
    showAvalanche: false,
    usesBridgeWarning: true,
  },
];

export function routeIdToWeatherSpotId(routeId: string): string {
  switch (routeId) {
    case 'tverrfjellet':
      return 'tverrfjellet';
    case 'rundfjellet':
      return 'rundfjellet';
    case 'coffee-malangen':
      return 'coffee-hike';
    case 'sandnessundbrua':
      return 'kvaloya-bridge';
    default:
      return 'charlottenlund';
  }
}

export function getBuiltinWeatherSpot(id: string): WeatherSpot {
  return BUILTIN_WEATHER_SPOTS.find((s) => s.id === id) ?? BUILTIN_WEATHER_SPOTS[0]!;
}

export async function loadCustomWeatherSpots(): Promise<WeatherSpot[]> {
  const saved = await loadJson<WeatherSpot[]>(STORAGE_KEY_CUSTOM_SPOTS);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        s.point &&
        Number.isFinite(s.point.latitude) &&
        Number.isFinite(s.point.longitude)
    )
    .map((s) => ({
      ...s,
      summit: null,
      showAvalanche: false,
      usesBridgeWarning: false,
      isCustom: true,
    }));
}

export async function saveCustomWeatherSpots(spots: WeatherSpot[]): Promise<void> {
  await saveJson(STORAGE_KEY_CUSTOM_SPOTS, spots);
}

/**
 * Extracts latitude and longitude from:
 * - "69.6492, 18.9553" or "69.6492 18.9553"
 * - Google Maps URLs containing "@69.6492,18.9553", "?q=69.6492,18.9553", or "!3d69.6492!4d18.9553"
 * - Norgeskart / Yr / generic strings with two decimal coordinates
 */
export function parseCoordinatesInput(
  raw: string
): { latitude: number; longitude: number } | null {
  const text = raw.trim();
  if (!text) return null;

  // Google Maps !3d<lat>!4d<lon>
  const mapsBang = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text);
  if (mapsBang?.[1] && mapsBang?.[2]) {
    const lat = Number(mapsBang[1]);
    const lon = Number(mapsBang[2]);
    if (isValidLatLon(lat, lon)) return { latitude: lat, longitude: lon };
  }

  // Google Maps @<lat>,<lon>
  const mapsAt = /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (mapsAt?.[1] && mapsAt?.[2]) {
    const lat = Number(mapsAt[1]);
    const lon = Number(mapsAt[2]);
    if (isValidLatLon(lat, lon)) return { latitude: lat, longitude: lon };
  }

  // Query param ?q=lat,lon or ll=lat,lon or lat=...&lon=...
  const queryLatLon = /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(
    text
  );
  if (queryLatLon?.[1] && queryLatLon?.[2]) {
    const lat = Number(queryLatLon[1]);
    const lon = Number(queryLatLon[2]);
    if (isValidLatLon(lat, lon)) return { latitude: lat, longitude: lon };
  }

  // Plain pair "69.6492, 18.9553" or "69.6492 18.9553" (also tolerate semicolon separator)
  const pair = /(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (pair?.[1] && pair?.[2]) {
    const lat = Number(pair[1]);
    const lon = Number(pair[2]);
    if (isValidLatLon(lat, lon)) return { latitude: lat, longitude: lon };
  }

  return null;
}

export function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
