import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_LOCATION_TASK = 'arctic-guide-background-tracking';

const STORAGE_KEY_SESSION = 'tracking:session_v1';
const STORAGE_KEY_LAST_SAMPLE = 'tracking:last_sample_v1';

export interface TrackingSample {
  lat: number;
  lon: number;
  alt: number | null;
  accuracy: number | null;
  timestamp: number;
}

export interface PersistedTrackingSession {
  routeId: string;
  trailStartedAtIso: string;
  altitudeOffset: number;
  isCalibrated: boolean;
  autoGatesReached: Record<string, string>;
  manualGatesReached: Record<string, string>;
}

type SampleListener = (sample: TrackingSample) => void;
const listeners = new Set<SampleListener>();

export function subscribeBackgroundSamples(listener: SampleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toSample(loc: Location.LocationObject): TrackingSample {
  return {
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    alt: loc.coords.altitude,
    accuracy: loc.coords.accuracy,
    timestamp: loc.timestamp ?? Date.now(),
  };
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;

    const payload = data as { locations?: Location.LocationObject[] };
    const locs = payload.locations;
    if (!Array.isArray(locs) || locs.length === 0) return;

    const latest = locs[locs.length - 1];
    if (!latest) return;

    const sample = toSample(latest);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LAST_SAMPLE, JSON.stringify(sample));
    } catch {}

    listeners.forEach((fn) => {
      try {
        fn(sample);
      } catch {}
    });
  });
}

export async function saveTrackingSession(session: PersistedTrackingSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch {}
}

export async function loadTrackingSession(): Promise<PersistedTrackingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedTrackingSession;
  } catch {
    return null;
  }
}

export async function clearTrackingSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_SESSION);
  } catch {}
}

export async function loadLastTrackingSample(): Promise<TrackingSample | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_LAST_SAMPLE);
    if (!raw) return null;
    return JSON.parse(raw) as TrackingSample;
  } catch {
    return null;
  }
}