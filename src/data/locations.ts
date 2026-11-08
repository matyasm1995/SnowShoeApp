import type { ChecklistId } from './checklists';

export type ActivityType = 'snowshoe';
export type ElevationMode = 'trailhead' | 'summit';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevationMeters: number;
}

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
  /** Compass bearing in degrees (0–360) heading uphill toward the main route/summit */
  ascentBearingDeg: number;
}

export const LOCATIONS: readonly TourLocation[] = [
  {
    id: 'charlottenlund',
    name: 'Tromsøya Easy (2.5h)',
    place: 'Charlottenlund',
    area: 'Tromsøya',
    durationLabel: '2.5h',
    activity: 'snowshoe',
    checklistId: 'standard',
    trailhead: { latitude: 69.664, longitude: 18.94, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350, // Gentle northbound loop
  },
  {
    id: 'tverrfjellet',
    name: 'Kvaløya Mountain (5h)',
    place: 'Tverrfjellet',
    area: 'Kattfjordeidet',
    durationLabel: '5h',
    activity: 'snowshoe',
    checklistId: 'mountain',
    trailhead: { latitude: 69.663, longitude: 18.423, elevationMeters: 180 },
    summit: { latitude: 69.663, longitude: 18.423, elevationMeters: 675 },
    ascentBearingDeg: 145, // Climbing south-east onto the ridge
  },
  {
    id: 'rundfjellet',
    name: 'Kvaløya Mountain (5h)',
    place: 'Rundfjellet',
    area: 'Radio Tower',
    durationLabel: '5h',
    activity: 'snowshoe',
    checklistId: 'mountain',
    trailhead: { latitude: 69.65, longitude: 18.72, elevationMeters: 60 },
    summit: { latitude: 69.65, longitude: 18.72, elevationMeters: 760 },
    ascentBearingDeg: 70, // Climbing east-northeast to the radio mast
  },
];

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