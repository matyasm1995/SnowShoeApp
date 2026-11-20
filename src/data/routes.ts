import type { ChecklistId } from './checklists';

export type TourCategory =
  | 'easy_snowshoe'
  | 'coffee_snowshoe'
  | 'hill_hike'
  | 'ski'
  | 'fatbike'
  | 'bridge';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  elevationMeters: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  cumDistanceKm: number;
}

export interface CheckpointGate {
  id: string;
  label: string;
  targetElevationMeters: number;
  targetDistanceKm?: number;
  offsetMinutes: number;
  isTurnaround?: boolean;
  lat?: number;
  lon?: number;
}

export interface ActivityRoute {
  id: string;
  name: string;
  shortLabel: string;
  area: string;
  category: TourCategory;
  checklistId: ChecklistId;
  defaultDurationMinutes: number;
  driveMinutesEachWay: number;
  backAtParkingBeforeEndMinutes?: number;
  meetingPoint?: string;
  returnNote: string;
  usesBridgeWarning: boolean;
  hasActiveTracking: boolean;
  trackingMode: 'elevation' | 'distance' | 'none';
  trailhead: GeoPoint;
  weatherPoint: GeoPoint;
  summit: GeoPoint | null;
  ascentBearingDeg: number;
  totalDistanceKm: number;
  gates: readonly CheckpointGate[];
  track: readonly TrackPoint[];
}

export const SANDNESSUNDBRUA_POINT: GeoPoint = {
  latitude: 69.6910,
  longitude: 18.9025,
  elevationMeters: 41,
};

export const SANDNESSUNDBRUA_GUST_WARNING_MS = 20;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return Math.round((toDeg(Math.atan2(y, x)) + 360) % 360);
}

function buildInterpolatedTrack(
  coords: readonly (readonly [number, number])[],
  startEle: number,
  endEle: number
): TrackPoint[] {
  if (coords.length === 0) return [];
  const cumDistances: number[] = [0];
  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (!prev || !curr) continue;
    total += haversineKm(prev[0], prev[1], curr[0], curr[1]);
    cumDistances.push(total);
  }

  return coords.map((pt, i) => {
    const d = cumDistances[i] ?? 0;
    const ratio = total > 0 ? d / total : 0;
    return {
      lat: pt[0],
      lon: pt[1],
      ele: Math.round(startEle + ratio * (endEle - startEle)),
      cumDistanceKm: Math.round(d * 100) / 100,
    };
  });
}

function buildMeasuredTrack(
  coords: readonly (readonly [number, number, number])[],
  targetTotalDistanceKm?: number
): TrackPoint[] {
  if (coords.length === 0) return [];
  const rawCum: number[] = [0];
  let total = 0;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    if (!prev || !curr) continue;
    total += haversineKm(prev[0], prev[1], curr[0], curr[1]);
    rawCum.push(total);
  }

  const scale =
    targetTotalDistanceKm && total > 0 ? targetTotalDistanceKm / total : 1;

  return coords.map((curr, i) => ({
    lat: curr[0],
    lon: curr[1],
    ele: Math.round(curr[2]),
    cumDistanceKm: Math.round((rawCum[i] ?? 0) * scale * 100) / 100,
  }));
}

const TVERRFJELLET_RAW: readonly (readonly [number, number])[] = [
  [69.644616, 18.470580],
  [69.646212, 18.467554],
  [69.647589, 18.465600],
  [69.648210, 18.463119],
  [69.648335, 18.460120],
  [69.648096, 18.456958],
  [69.647935, 18.452696],
  [69.647514, 18.448009],
  [69.646818, 18.443741],
  [69.646672, 18.442014],
  [69.647151, 18.440886],
  [69.647338, 18.439492],
  [69.647306, 18.438328],
  [69.647533, 18.437781],
  [69.647970, 18.436837],
  [69.648486, 18.435714],
  [69.649048, 18.434297],
  [69.649206, 18.433501],
  [69.649711, 18.431730],
  [69.649980, 18.430722],
  [69.650096, 18.429797],
  [69.650067, 18.429217],
  [69.649428, 18.428562],
  [69.648789, 18.428489],
  [69.647969, 18.429612],
];

const RUNDFJELLET_NORTH_RAW: readonly (readonly [number, number])[] = [
  [69.646070, 18.732154],
  [69.645893, 18.731555],
  [69.645921, 18.730262],
  [69.646061, 18.729433],
  [69.645796, 18.727971],
  [69.645920, 18.726386],
  [69.646028, 18.725120],
  [69.645979, 18.723577],
  [69.645494, 18.721916],
  [69.645520, 18.720496],
  [69.645966, 18.718602],
  [69.646158, 18.716888],
  [69.646427, 18.715578],
  [69.647119, 18.714515],
  [69.647597, 18.713649],
  [69.647704, 18.712505],
  [69.647188, 18.709709],
  [69.646478, 18.707200],
  [69.645873, 18.704224],
  [69.645689, 18.701980],
  [69.645385, 18.698916],
  [69.645452, 18.697458],
  [69.645848, 18.696069],
  [69.646009, 18.695036],
  [69.645779, 18.693750],
  [69.645269, 18.691568],
  [69.645779, 18.689715],
  [69.646311, 18.687777],
  [69.646818, 18.685263],
  [69.647198, 18.682874],
  [69.647616, 18.681515],
  [69.648102, 18.680189],
  [69.648633, 18.678863],
];

const FATBIKE_MEASURED_RAW: readonly (readonly [number, number, number])[] = [
  [69.649410, 18.958100, 5.3],
  [69.649040, 18.954790, 6.2],
  [69.650070, 18.947690, 22.8],
  [69.652490, 18.943780, 65.8],
  [69.654560, 18.942540, 94.0],
  [69.657980, 18.938990, 97.4],
  [69.660600, 18.939040, 100.2],
  [69.664240, 18.943750, 105.0],
  [69.667625, 18.948433, 114.2],
  [69.670840, 18.954050, 108.5],
  [69.673870, 18.955470, 89.2],
  [69.677510, 18.960030, 81.9],
  [69.680550, 18.963150, 71.7],
  [69.684430, 18.967540, 62.3],
  [69.687310, 18.969330, 54.0],
  [69.689710, 18.972230, 39.2],
  [69.691550, 18.983010, 38.4],
  [69.692970, 18.986330, 31.3],
  [69.696760, 18.982290, 60.4],
  [69.701070, 18.986640, 75.4],
  [69.704410, 18.993610, 96.4],
  [69.705240, 19.000618, 136.0],
  [69.705160, 19.001950, 132.6],
];

const COFFEE_HIKE_MEASURED_RAW: readonly (readonly [number, number, number])[] = [
  [69.526290, 18.863026, 15.5],
  [69.526270, 18.855130, 27.1],
  [69.526060, 18.842394, 50.3],
  [69.526430, 18.862620, 15.2],
];

const tverrfjelletTrack = buildInterpolatedTrack(TVERRFJELLET_RAW, 105, 524);
const rundfjelletTrack = buildInterpolatedTrack(RUNDFJELLET_NORTH_RAW, 10, 472);
const fatbikeTrack = buildMeasuredTrack(FATBIKE_MEASURED_RAW, 10.33);
const coffeeTrack = buildMeasuredTrack(COFFEE_HIKE_MEASURED_RAW);

const tverrDist = tverrfjelletTrack[tverrfjelletTrack.length - 1]?.cumDistanceKm ?? 1.9;
const rundDist = rundfjelletTrack[rundfjelletTrack.length - 1]?.cumDistanceKm ?? 2.3;
const fatbikeDist = fatbikeTrack[fatbikeTrack.length - 1]?.cumDistanceKm ?? 10.33;
const coffeeDist = coffeeTrack[coffeeTrack.length - 1]?.cumDistanceKm ?? 1.7;

export const ROUTE_CATALOG: readonly ActivityRoute[] = [
  {
    id: 'tverrfjellet',
    name: 'Tverrfjellet · Hill Hike (5h)',
    shortLabel: 'Tverrfjellet',
    area: 'Kattfjordeidet',
    category: 'hill_hike',
    checklistId: 'mountain',
    defaultDurationMinutes: 300,
    driveMinutesEachWay: 45,
    backAtParkingBeforeEndMinutes: 45,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      '45 min drive each way. Gate 2 at the top (524 m / +2h 00m) is your reminder to head down and reach the car ≥45 min before tour end.',
    usesBridgeWarning: true,
    hasActiveTracking: true,
    trackingMode: 'elevation',
    trailhead: { latitude: 69.644616, longitude: 18.470580, elevationMeters: 105 },
    weatherPoint: { latitude: 69.644616, longitude: 18.470580, elevationMeters: 105 },
    summit: { latitude: 69.650067, longitude: 18.429217, elevationMeters: 524 },
    ascentBearingDeg: bearingDegrees(69.644616, 18.470580, 69.650067, 18.429217),
    totalDistanceKm: tverrDist,
    gates: [
      {
        id: 'tverr-g1',
        label: 'Gate 1 · Pace Check',
        targetElevationMeters: 330,
        offsetMinutes: 60,
      },
      {
        id: 'tverr-g2',
        label: 'Gate 2 · Top Turnaround',
        targetElevationMeters: 524,
        offsetMinutes: 120,
        isTurnaround: true,
        lat: 69.650067,
        lon: 18.429217,
      },
    ],
    track: tverrfjelletTrack,
  },
  {
    id: 'rundfjellet',
    name: 'Rundfjellet · North Route (5h)',
    shortLabel: 'Rundfjellet',
    area: 'Kaldfjord North',
    category: 'hill_hike',
    checklistId: 'mountain',
    defaultDurationMinutes: 300,
    driveMinutesEachWay: 30,
    backAtParkingBeforeEndMinutes: 30,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      '30 min drive each way. Watch Gate 1 (250 m / +1h 15m) & Gate 2 (400 m / +1h 45m); start descending from 472 m by +2h 15m.',
    usesBridgeWarning: true,
    hasActiveTracking: true,
    trackingMode: 'elevation',
    trailhead: { latitude: 69.646070, longitude: 18.732154, elevationMeters: 10 },
    weatherPoint: { latitude: 69.646070, longitude: 18.732154, elevationMeters: 10 },
    summit: { latitude: 69.648633, longitude: 18.678863, elevationMeters: 472 },
    ascentBearingDeg: bearingDegrees(69.646070, 18.732154, 69.648633, 18.678863),
    totalDistanceKm: rundDist,
    gates: [
      {
        id: 'rund-g1',
        label: 'Gate 1 · Pace Check',
        targetElevationMeters: 250,
        offsetMinutes: 75,
      },
      {
        id: 'rund-g2',
        label: 'Gate 2 · Upper Ridge',
        targetElevationMeters: 400,
        offsetMinutes: 105,
      },
      {
        id: 'rund-top',
        label: 'Summit · Turnaround',
        targetElevationMeters: 472,
        offsetMinutes: 135,
        isTurnaround: true,
        lat: 69.648633,
        lon: 18.678863,
      },
    ],
    track: rundfjelletTrack,
  },
  {
    id: 'coffee-malangen',
    name: 'Coffee Trip 09:00 (4.5h)',
    shortLabel: 'Coffee Hike',
    area: "Tove's Tradisjonsmat (Malangen)",
    category: 'coffee_snowshoe',
    checklistId: 'standard',
    defaultDurationMinutes: 270,
    driveMinutesEachWay: 60,
    backAtParkingBeforeEndMinutes: 90,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      "1h drive each way. Be back from the hike at Tove's Tradisjonsmat 1h 30m before tour end so guests have time for coffee before the drive back.",
    usesBridgeWarning: true,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.526290, longitude: 18.863026, elevationMeters: 15 },
    weatherPoint: { latitude: 69.526100, longitude: 18.852700, elevationMeters: 35 },
    summit: null,
    ascentBearingDeg: 270,
    totalDistanceKm: coffeeDist,
    gates: [],
    track: coffeeTrack,
  },
  {
    id: 'snowshoe-charlottenlund',
    name: 'Snowshoe Tromsøya 10:00 (2.5h)',
    shortLabel: 'Easy Snowshoe',
    area: 'Charlottenlund',
    category: 'easy_snowshoe',
    checklistId: 'standard',
    defaultDurationMinutes: 150,
    driveMinutesEachWay: 15,
    backAtParkingBeforeEndMinutes: 20,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      'Set trail at Charlottenlund. Finish walking ~20 min before tour end for the short drive back to Tromsø Outdoor.',
    usesBridgeWarning: false,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    weatherPoint: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350,
    totalDistanceKm: 2.5,
    gates: [],
    track: [],
  },
  {
    id: 'hg-snowshoe',
    name: 'HG Snowshoe 14:15',
    shortLabel: 'HG Snowshoe',
    area: 'Charlottenlund · Hurtigruten / Havila',
    category: 'easy_snowshoe',
    checklistId: 'hg_snowshoe',
    defaultDurationMinutes: 165,
    driveMinutesEachWay: 15,
    backAtParkingBeforeEndMinutes: 20,
    meetingPoint: 'Prostneset',
    returnNote:
      'Meet & end at Prostneset. Bring headlamps, matches, firewood, firepan & toboggans.',
    usesBridgeWarning: false,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    weatherPoint: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350,
    totalDistanceKm: 2.5,
    gates: [],
    track: [],
  },
  {
    id: 'ski-charlottenlund',
    name: 'XC Ski 09:00 / 13:30 (3h)',
    shortLabel: 'XC Ski',
    area: 'Charlottenlund',
    category: 'ski',
    checklistId: 'standard',
    defaultDurationMinutes: 180,
    driveMinutesEachWay: 15,
    backAtParkingBeforeEndMinutes: 20,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      'Charlottenlund ski loop. Wrap up ~20 min before tour end to pack skis and drive back to Tromsø Outdoor.',
    usesBridgeWarning: false,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    weatherPoint: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350,
    totalDistanceKm: 4.0,
    gates: [],
    track: [],
  },
  {
    id: 'hg-ski',
    name: 'HG Ski 14:15',
    shortLabel: 'HG Ski',
    area: 'Charlottenlund · Hurtigruten / Havila',
    category: 'ski',
    checklistId: 'hg_ski',
    defaultDurationMinutes: 165,
    driveMinutesEachWay: 15,
    backAtParkingBeforeEndMinutes: 20,
    meetingPoint: 'Prostneset',
    returnNote:
      'Meet & end at Prostneset. Bring skis & ski shoes for guests.',
    usesBridgeWarning: false,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    weatherPoint: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350,
    totalDistanceKm: 4.0,
    gates: [],
    track: [],
  },
  {
    id: 'fatbike-tromsoya',
    name: 'Fatbike (3h)',
    shortLabel: 'Fatbike',
    area: 'Tromsøya North',
    category: 'fatbike',
    checklistId: 'fatbike',
    defaultDurationMinutes: 180,
    driveMinutesEachWay: 0,
    meetingPoint: 'Tromsø Outdoor Shop',
    returnNote:
      'Starts at Tromsø Outdoor shop (0 min drive). Reach the northern turning point in +1h 30m so you are back on time.',
    usesBridgeWarning: false,
    hasActiveTracking: true,
    trackingMode: 'distance',
    trailhead: { latitude: 69.649410, longitude: 18.958100, elevationMeters: 5 },
    weatherPoint: { latitude: 69.680550, longitude: 18.963150, elevationMeters: 72 },
    summit: null,
    ascentBearingDeg: bearingDegrees(69.649410, 18.958100, 69.705240, 19.000618),
    totalDistanceKm: fatbikeDist,
    gates: [
      {
        id: 'fb-mid',
        label: 'Prestvannet / Charlottenlund Ridge',
        targetElevationMeters: 114,
        targetDistanceKm: fatbikeTrack[8]?.cumDistanceKm ?? 3.5,
        offsetMinutes: 35,
        lat: 69.667625,
        lon: 18.948433,
      },
      {
        id: 'fb-turn',
        label: 'Turning Point · North End',
        targetElevationMeters: 136,
        targetDistanceKm: fatbikeDist,
        offsetMinutes: 90,
        isTurnaround: true,
        lat: 69.705240,
        lon: 19.000618,
      },
    ],
    track: fatbikeTrack,
  },
  {
    id: 'cruise-ski',
    name: 'Cruise Ski Trip (Charter)',
    shortLabel: 'Cruise Ski',
    area: 'Finnmarken / Midnatsol / Trollfjord',
    category: 'ski',
    checklistId: 'hg_ski',
    defaultDurationMinutes: 180,
    driveMinutesEachWay: 15,
    backAtParkingBeforeEndMinutes: 20,
    meetingPoint: 'Check tour cell / note (Kai 8, Kai 21, Prostneset)',
    returnNote:
      'Charter ski trip for cruise ships. Check cell/note for Kai 8, Kai 21, or Prostneset meeting point. Bring skis & shoes.',
    usesBridgeWarning: false,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    weatherPoint: { latitude: 69.664, longitude: 18.940, elevationMeters: 100 },
    summit: null,
    ascentBearingDeg: 350,
    totalDistanceKm: 4.0,
    gates: [],
    track: [],
  },
  {
    id: 'sandnessundbrua',
    name: 'Sandnessundbrua · Kvaløya Bridge',
    shortLabel: 'Kvaløya Bridge',
    area: 'Fv862 Bridge Deck (41m)',
    category: 'bridge',
    checklistId: 'standard',
    defaultDurationMinutes: 180,
    driveMinutesEachWay: 15,
    returnNote:
      'Watch gusts ≥20 m/s on Sandnessundbrua for Caravelle and Minibus crossings to Kvaløya.',
    usesBridgeWarning: true,
    hasActiveTracking: false,
    trackingMode: 'none',
    trailhead: SANDNESSUNDBRUA_POINT,
    weatherPoint: SANDNESSUNDBRUA_POINT,
    summit: null,
    ascentBearingDeg: 295,
    totalDistanceKm: 1.2,
    gates: [],
    track: [],
  },
];

export function getRouteById(id: string): ActivityRoute {
  return ROUTE_CATALOG.find((r) => r.id === id) ?? ROUTE_CATALOG[0]!;
}

export function matchRouteForText(
  category: TourCategory,
  combinedText: string,
  defaultMountainId: string
): ActivityRoute {
  const lower = combinedText.toLowerCase();

  if (category === 'bridge') return getRouteById('sandnessundbrua');
  if (category === 'coffee_snowshoe') return getRouteById('coffee-malangen');
  if (category === 'fatbike') return getRouteById('fatbike-tromsoya');

  const isShip =
    lower.includes('14:15') ||
    lower.includes('14.15') ||
    lower.includes('hg') ||
    lower.includes('hurtigruten') ||
    lower.includes('havila');

  const isCruiseCharter =
    lower.includes('finnmarken') ||
    lower.includes('midnatsol') ||
    lower.includes('trollfjord') ||
    lower.includes('kai 8') ||
    lower.includes('kai 21');

  if (category === 'ski') {
    if (isCruiseCharter) return getRouteById('cruise-ski');
    if (isShip) return getRouteById('hg-ski');
    return getRouteById('ski-charlottenlund');
  }

  if (category === 'easy_snowshoe') {
    if (isShip) return getRouteById('hg-snowshoe');
    return getRouteById('snowshoe-charlottenlund');
  }

  if (lower.includes('rundfjell')) return getRouteById('rundfjellet');
  if (lower.includes('tverrfjell')) return getRouteById('tverrfjellet');

  return defaultMountainId === 'rundfjellet'
    ? getRouteById('rundfjellet')
    : getRouteById('tverrfjellet');
}