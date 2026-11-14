import type { ChecklistId } from './checklists';
import { ROUTE_CATALOG, type GeoPoint } from './routes';

export type { GeoPoint };
export type ActivityType = 'snowshoe';
export type ElevationMode = 'trailhead' | 'summit';

export interface TourLocation {
  id: string;
  name: string;
  place: string;
  area: string;
  durationLabel: string;
  activity: ActivityType;
  checklistId: ChecklistId;
  trailhead: GeoPoint;
  summit: GeoPoint | null;
  ascentBearingDeg: number;
}

export const LOCATIONS: readonly TourLocation[] = ROUTE_CATALOG.map((r) => ({
  id: r.id,
  name: r.name,
  place: r.shortLabel,
  area: r.area,
  durationLabel: `${(r.defaultDurationMinutes / 60).toFixed(1).replace(/\.0$/, '')}h`,
  activity: 'snowshoe',
  checklistId: r.checklistId,
  trailhead: r.weatherPoint,
  summit: r.summit,
  ascentBearingDeg: r.ascentBearingDeg,
}));

export const KATTFJORDEIDET_CAMERAS_URL = 'https://www.vegvesen.no/trafikk/webkamera';

export function getLocation(id: string): TourLocation {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0]!;
}

export function pointFor(location: TourLocation, mode: ElevationMode): GeoPoint {
  if (mode === 'summit' && location.summit) {
    return location.summit;
  }
  return location.trailhead;
}