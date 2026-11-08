import SunCalc from 'suncalc';

export const TROMSO_COORDINATES = {
  latitude: 69.6492,
  longitude: 18.9553,
} as const;

const WIND_CHILL_MIN_KMH = 4.8;
const WIND_CHILL_MAX_TEMP_C = 10;

export type ExposureLevel =
  | 'comfortable'
  | 'safe'
  | 'minor'
  | 'frostbite-moderate'
  | 'frostbite-severe'
  | 'extreme';

export interface ExposureAssessment {
  level: ExposureLevel;
  label: string;
  detail: string;
  color: string;
  backgroundColor: string;
}

export interface TwilightClocks {
  sunrise: Date | null;
  sunset: Date | null;
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  solarNoon: Date | null;
}

export type DaylightPhase = 'daylight' | 'civil' | 'nautical' | 'night' | 'polar-night';

export interface DaylightStatus {
  clocks: TwilightClocks;
  phase: DaylightPhase;
  label: string;
  detail: string;
  progress: number;
  remainingMs: number | null;
  countdownLabel: string;
}

export interface SunCurvePoint {
  hour: number;
  altitudeDeg: number;
}

export type WindRelativeExposure =
  | 'Headwind (In your face)'
  | 'Tailwind (At your back)'
  | 'Crosswind (Left cheek)'
  | 'Crosswind (Right cheek)';

export function calculateWindChill(tempC: number, windSpeedKmh: number): number {
  if (tempC > WIND_CHILL_MAX_TEMP_C || windSpeedKmh < WIND_CHILL_MIN_KMH) {
    return tempC;
  }
  const windPower = Math.pow(windSpeedKmh, 0.16);
  return 13.12 + 0.6215 * tempC - 11.37 * windPower + 0.3965 * tempC * windPower;
}

export function windChillApplies(tempC: number, windSpeedKmh: number): boolean {
  return tempC <= WIND_CHILL_MAX_TEMP_C && windSpeedKmh >= WIND_CHILL_MIN_KMH;
}

export function metersPerSecondToKmh(mps: number): number {
  return mps * 3.6;
}

export function exposureRisk(windChillC: number): ExposureAssessment {
  if (windChillC >= 0) {
    return {
      level: 'comfortable',
      label: 'Comfortable',
      detail: 'Felt temperature is above 0°C. Low thermal stress.',
      color: '#4ADE80',
      backgroundColor: '#064E3B',
    };
  }
  if (windChillC > -15) {
    return {
      level: 'safe',
      label: 'Safe (Moderate cold)',
      detail: 'Felt temperature is between 0°C and −14°C.',
      color: '#38BDF8',
      backgroundColor: '#0C4A6E',
    };
  }
  if (windChillC > -25) {
    return {
      level: 'minor',
      label: 'Chilly — Cover skin',
      detail: 'Felt temperature is between −15°C and −24°C. Wear mittens & buff.',
      color: '#FACC15',
      backgroundColor: '#713F12',
    };
  }
  if (windChillC > -35) {
    return {
      level: 'frostbite-moderate',
      label: 'Frostbite watch (15–30 min)',
      detail: 'Felt temperature is −25°C to −34°C. Check guest cheeks/noses.',
      color: '#FB923C',
      backgroundColor: '#7C2D12',
    };
  }
  if (windChillC >= -45) {
    return {
      level: 'frostbite-severe',
      label: 'Frostbite warning (<10 min)',
      detail: 'Felt temperature is −35°C to −44°C. Exposed skin freezes quickly.',
      color: '#EF4444',
      backgroundColor: '#7F1D1D',
    };
  }
  return {
    level: 'extreme',
    label: 'EXTREME COLD (<2 min)',
    detail: 'Below −45°C. Immediate risk of cold injury.',
    color: '#E879F9',
    backgroundColor: '#581C87',
  };
}

export function calculateWindRelativeExposure(
  trailBearingDeg: number,
  windFromDeg: number | null
): WindRelativeExposure {
  if (windFromDeg === null) return 'Crosswind (Left cheek)';
  const diff = ((windFromDeg - trailBearingDeg + 360) % 360);

  if (diff <= 45 || diff >= 315) {
    return 'Headwind (In your face)';
  }
  if (diff >= 135 && diff <= 225) {
    return 'Tailwind (At your back)';
  }
  if (diff > 45 && diff < 135) {
    return 'Crosswind (Right cheek)';
  }
  return 'Crosswind (Left cheek)';
}

export function estimateSnowlineMeters(
  trailheadElev: number,
  trailheadTemp: number,
  summitElev: number | null,
  summitTemp: number | null
): { snowlineMeters: number | null; label: string } {
  if (!summitElev || summitTemp === null) {
    if (trailheadTemp <= 0.5) return { snowlineMeters: trailheadElev, label: 'Snow down to parking (Sea level)' };
    return { snowlineMeters: null, label: 'Rain / Wet at trail level' };
  }

  if (trailheadTemp <= 0.5) {
    return { snowlineMeters: trailheadElev, label: 'Snow all the way down to parking' };
  }
  if (summitTemp > 0.5) {
    return { snowlineMeters: null, label: 'Above summit (Rain even at top)' };
  }

  const elevDiff = summitElev - trailheadElev;
  const tempDiff = trailheadTemp - summitTemp;
  if (tempDiff <= 0) {
    return { snowlineMeters: trailheadElev, label: 'Snow across route' };
  }

  const lapse = tempDiff / elevDiff;
  const metersAboveTrailhead = trailheadTemp / lapse;
  const snowline = Math.round(trailheadElev + metersAboveTrailhead);

  return {
    snowlineMeters: snowline,
    label: `Freezing line at ~${snowline}m (Rain below, snow above)`,
  };
}

export function estimateFreshSnowCm(precipMm: number, tempC: number): number {
  if (tempC > 1.0 || precipMm <= 0) return 0;
  // Cold Arctic snow expansion ratio ~ 1.2 to 1.5 cm per mm
  const ratio = tempC < -4 ? 1.4 : 1.1;
  return Math.round(precipMm * ratio * 10) / 10;
}

export function get24HourSunCurve(date = new Date()): SunCurvePoint[] {
  const points: SunCurvePoint[] = [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  for (let h = 0; h <= 24; h += 1) {
    const d = new Date(year, month, day, h, 0, 0);
    const pos = SunCalc.getPosition(d, TROMSO_COORDINATES.latitude, TROMSO_COORDINATES.longitude);
    const altDeg = (pos.altitude * 180) / Math.PI;
    points.push({ hour: h, altitudeDeg: altDeg });
  }
  return points;
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;

export function windCardinal(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % CARDINALS.length;
  return CARDINALS[index] ?? 'N';
}

function isValid(v: Date | undefined): v is Date {
  return v instanceof Date && !isNaN(v.getTime());
}

export function tromsoDaylight(date = new Date()): DaylightStatus {
  const times = SunCalc.getTimes(date, TROMSO_COORDINATES.latitude, TROMSO_COORDINATES.longitude);
  const now = date.getTime();
  const clocks: TwilightClocks = {
    sunrise: isValid(times.sunrise) ? times.sunrise : null,
    sunset: isValid(times.sunset) ? times.sunset : null,
    civilDawn: isValid(times.dawn) ? times.dawn : null,
    civilDusk: isValid(times.dusk) ? times.dusk : null,
    nauticalDawn: isValid(times.nauticalDawn) ? times.nauticalDawn : null,
    nauticalDusk: isValid(times.nauticalDusk) ? times.nauticalDusk : null,
    solarNoon: isValid(times.solarNoon) ? times.solarNoon : null,
  };

  const base = { clocks, progress: 0 };

  if (clocks.sunrise && clocks.sunset && now >= clocks.sunrise.getTime() && now <= clocks.sunset.getTime()) {
    const span = clocks.sunset.getTime() - clocks.sunrise.getTime();
    return {
      ...base,
      phase: 'daylight',
      label: 'Sun is up',
      detail: 'Direct sunlight is above the horizon.',
      progress: Math.min(1, Math.max(0, (now - clocks.sunrise.getTime()) / span)),
      remainingMs: clocks.sunset.getTime() - now,
      countdownLabel: 'Sunset',
    };
  }

  if (clocks.civilDawn && clocks.civilDusk && now >= clocks.civilDawn.getTime() && now <= clocks.civilDusk.getTime()) {
    const span = clocks.civilDusk.getTime() - clocks.civilDawn.getTime();
    return {
      ...base,
      phase: 'civil',
      label: 'Civil daylight',
      detail: 'Usable ambient light without headlamps.',
      progress: Math.min(1, Math.max(0, (now - clocks.civilDawn.getTime()) / span)),
      remainingMs: clocks.civilDusk.getTime() - now,
      countdownLabel: 'Civil dusk',
    };
  }

  if (clocks.nauticalDawn && clocks.nauticalDusk && now >= clocks.nauticalDawn.getTime() && now <= clocks.nauticalDusk.getTime()) {
    const span = clocks.nauticalDusk.getTime() - clocks.nauticalDawn.getTime();
    return {
      ...base,
      phase: 'nautical',
      label: 'Blue hour',
      detail: 'Deep twilight glow. Headlamps recommended.',
      progress: Math.min(1, Math.max(0, (now - clocks.nauticalDawn.getTime()) / span)),
      remainingMs: clocks.nauticalDusk.getTime() - now,
      countdownLabel: 'Nautical dusk',
    };
  }

  if (!clocks.sunrise && !clocks.sunset) {
    return {
      ...base,
      phase: 'polar-night',
      label: 'Polar night',
      detail: 'Sun does not rise. Look for midday twilight colors.',
      remainingMs: null,
      countdownLabel: 'Polar night',
    };
  }

  return {
    ...base,
    phase: 'night',
    label: 'Night time',
    detail: 'Sun is below nautical twilight.',
    remainingMs: null,
    countdownLabel: 'Night',
  };
}