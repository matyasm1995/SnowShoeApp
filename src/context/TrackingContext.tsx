import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getRouteById,
  haversineKm,
  type ActivityRoute,
  type CheckpointGate,
} from '../data/routes';
import {
  BACKGROUND_LOCATION_TASK,
  clearTrackingSession,
  loadLastTrackingSample,
  loadTrackingSession,
  saveTrackingSession,
  subscribeBackgroundSamples,
  type TrackingSample,
} from '../services/backgroundTracking';
import { colors } from '../theme';

const TROMSO_DEFAULT_GEOID_OFFSET_M = -32;
const ASKED_BG_LOCATION_KEY = 'pref:asked_bg_location_v1';

export type GatePaceStatus = 'upcoming' | 'reached' | 'late' | 'turnaround_now';

export interface GateEvaluation {
  gate: CheckpointGate;
  targetClockTime: Date | null;
  reachedAt: Date | null;
  status: GatePaceStatus;
  deltaMinutes: number | null;
  remainingText: string;
}

export interface TrackingContextValue {
  trackingActive: boolean;
  backgroundServiceActive: boolean;
  trackedRoute: ActivityRoute | null;
  gpsError: string | null;
  rawAltitudeM: number | null;
  effectiveAltitudeM: number | null;
  isCalibrated: boolean;
  accuracyMeters: number | null;
  distanceAlongTrackKm: number;
  distanceOffRouteMeters: number | null;
  trailStartedAt: Date | null;
  elapsedSeconds: number;
  progressPct: number;
  evaluateGatesForRoute: (
    route: ActivityRoute,
    tourStartMinutes: number | null,
    now: Date
  ) => { gates: GateEvaluation[]; isProjectedStart: boolean };
  startTracking: (route: ActivityRoute) => Promise<void>;
  stopTracking: () => Promise<void>;
  calibrateAtParking: (route: ActivityRoute) => void;
  toggleManualGate: (gateId: string) => void;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

function isoMapToDates(map: Record<string, string>): Record<string, Date> {
  const out: Record<string, Date> = {};
  for (const [k, v] of Object.entries(map)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) out[k] = d;
  }
  return out;
}

function datesMapToIso(map: Record<string, Date>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = v.toISOString();
  }
  return out;
}

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [trackingActive, setTrackingActive] = useState(false);
  const [backgroundServiceActive, setBackgroundServiceActive] = useState(false);
  const [trackedRouteId, setTrackedRouteId] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [sample, setSample] = useState<TrackingSample | null>(null);
  const [altitudeOffset, setAltitudeOffset] = useState<number>(TROMSO_DEFAULT_GEOID_OFFSET_M);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [trailStartedAt, setTrailStartedAt] = useState<Date | null>(null);
  const [autoGatesReached, setAutoGatesReached] = useState<Record<string, Date>>({});
  const [manualGatesReached, setManualGatesReached] = useState<Record<string, Date>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  const trackedRoute: ActivityRoute | null = useMemo(() => {
    return trackedRouteId ? getRouteById(trackedRouteId) : null;
  }, [trackedRouteId]);

  const stopForegroundWatcher = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  }, []);

  const attachForegroundWatcher = useCallback(async () => {
    stopForegroundWatcher();
    watcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 4000,
        distanceInterval: 6,
      },
      (loc) => {
        setSample({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          alt: loc.coords.altitude,
          accuracy: loc.coords.accuracy,
          timestamp: loc.timestamp ?? Date.now(),
        });
      }
    );
  }, [stopForegroundWatcher]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [session, lastSample] = await Promise.all([
        loadTrackingSession(),
        loadLastTrackingSample(),
      ]);
      if (!mounted) return;
      if (lastSample) setSample(lastSample);

      if (session) {
        const started = new Date(session.trailStartedAtIso);
        setTrackedRouteId(session.routeId);
        setTrailStartedAt(Number.isNaN(started.getTime()) ? new Date() : started);
        setAltitudeOffset(session.altitudeOffset);
        setIsCalibrated(session.isCalibrated);
        setAutoGatesReached(isoMapToDates(session.autoGatesReached));
        setManualGatesReached(isoMapToDates(session.manualGatesReached));
        setTrackingActive(true);

        try {
          const isBgRunning = await Location.hasStartedLocationUpdatesAsync(
            BACKGROUND_LOCATION_TASK
          );
          if (mounted) setBackgroundServiceActive(isBgRunning);
          if (!isBgRunning) {
            await attachForegroundWatcher();
          }
        } catch {
          try {
            await attachForegroundWatcher();
          } catch {}
        }
      }
    })();

    const unsub = subscribeBackgroundSamples((incoming) => {
      setSample(incoming);
    });

    return () => {
      mounted = false;
      unsub();
      stopForegroundWatcher();
    };
  }, [attachForegroundWatcher, stopForegroundWatcher]);

  useEffect(() => {
    if (!trackingActive) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [trackingActive]);

  useEffect(() => {
    if (!trackingActive || !trackedRouteId || !trailStartedAt) return;
    void saveTrackingSession({
      routeId: trackedRouteId,
      trailStartedAtIso: trailStartedAt.toISOString(),
      altitudeOffset,
      isCalibrated,
      autoGatesReached: datesMapToIso(autoGatesReached),
      manualGatesReached: datesMapToIso(manualGatesReached),
    });
  }, [
    trackingActive,
    trackedRouteId,
    trailStartedAt,
    altitudeOffset,
    isCalibrated,
    autoGatesReached,
    manualGatesReached,
  ]);

  const rawAltitudeM =
    sample?.alt !== null && sample?.alt !== undefined ? Math.round(sample.alt) : null;

  const effectiveAltitudeM = useMemo(() => {
    if (rawAltitudeM === null) return null;
    return Math.round(rawAltitudeM + altitudeOffset);
  }, [rawAltitudeM, altitudeOffset]);

  const trackMatch = useMemo(() => {
    if (!sample || !trackedRoute || trackedRoute.track.length === 0) {
      return {
        distanceAlongTrackKm: 0,
        distanceOffRouteMeters: null as number | null,
        nearestTrackEleM: null as number | null,
      };
    }

    let bestDistKm = Infinity;
    let bestAlongKm = 0;
    let bestEle = trackedRoute.trailhead.elevationMeters;

    for (const pt of trackedRoute.track) {
      const d = haversineKm(sample.lat, sample.lon, pt.lat, pt.lon);
      if (d < bestDistKm) {
        bestDistKm = d;
        bestAlongKm = pt.cumDistanceKm;
        bestEle = pt.ele;
      }
    }

    return {
      distanceAlongTrackKm: bestAlongKm,
      distanceOffRouteMeters: Math.round(bestDistKm * 1000),
      nearestTrackEleM: bestEle,
    };
  }, [sample, trackedRoute]);

  useEffect(() => {
    if (!trackingActive || !sample || !trackedRoute) return;

    const nearRoute =
      trackMatch.distanceOffRouteMeters === null || trackMatch.distanceOffRouteMeters <= 400;
    if (!nearRoute) return;

    const currentElev = effectiveAltitudeM ?? trackMatch.nearestTrackEleM;

    for (const gate of trackedRoute.gates) {
      if (autoGatesReached[gate.id] || manualGatesReached[gate.id]) continue;

      let reached = false;
      if (trackedRoute.trackingMode === 'distance') {
        const targetDist = gate.targetDistanceKm ?? trackedRoute.totalDistanceKm;
        if (gate.lat !== undefined && gate.lon !== undefined) {
          const distToGateM = haversineKm(sample.lat, sample.lon, gate.lat, gate.lon) * 1000;
          if (distToGateM <= 180) reached = true;
        }
        if (trackMatch.distanceAlongTrackKm >= targetDist - 0.2) reached = true;
      } else if (trackedRoute.trackingMode === 'elevation') {
        // Top / turnaround gates keep a -10m buffer; intermediate gates require exact elevation
        const bufferM = gate.isTurnaround ? 10 : 0;
        if (currentElev !== null && currentElev >= gate.targetElevationMeters - bufferM) {
          reached = true;
        }
      }

      if (reached) {
        setAutoGatesReached((prev) => ({ ...prev, [gate.id]: new Date() }));
      }
    }
  }, [
    trackingActive,
    sample,
    trackedRoute,
    trackMatch,
    effectiveAltitudeM,
    autoGatesReached,
    manualGatesReached,
  ]);

  const startTracking = useCallback(
    async (route: ActivityRoute) => {
      setGpsError(null);

      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        fg = await Location.requestForegroundPermissionsAsync();
      }
      if (fg.status !== 'granted') {
        setGpsError('Location permission denied.');
        return;
      }

      const startNow = new Date();
      setTrackedRouteId(route.id);
      setTrailStartedAt(startNow);
      setNowMs(startNow.getTime());
      setAutoGatesReached({});
      setManualGatesReached({});
      setIsCalibrated(false);
      setAltitudeOffset(TROMSO_DEFAULT_GEOID_OFFSET_M);
      setTrackingActive(true);

      try {
        const initial =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          }));
        if (initial) {
          const initialSample: TrackingSample = {
            lat: initial.coords.latitude,
            lon: initial.coords.longitude,
            alt: initial.coords.altitude,
            accuracy: initial.coords.accuracy,
            timestamp: initial.timestamp ?? Date.now(),
          };
          setSample(initialSample);

          if (initial.coords.altitude !== null) {
            const distKm = haversineKm(
              initial.coords.latitude,
              initial.coords.longitude,
              route.trailhead.latitude,
              route.trailhead.longitude
            );
            if (distKm < 0.35) {
              setAltitudeOffset(
                route.trailhead.elevationMeters - Math.round(initial.coords.altitude)
              );
              setIsCalibrated(true);
            }
          }
        }
      } catch {}

      let bgStarted = false;
      try {
        let bg = await Location.getBackgroundPermissionsAsync();
        if (bg.status !== 'granted') {
          const alreadyAsked = await AsyncStorage.getItem(ASKED_BG_LOCATION_KEY);
          if (alreadyAsked !== 'true') {
            await AsyncStorage.setItem(ASKED_BG_LOCATION_KEY, 'true');
            bg = await Location.requestBackgroundPermissionsAsync();
          }
        }
        if (bg.status === 'granted') {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 4000,
            distanceInterval: 6,
            foregroundService: {
              notificationTitle: `Tracking ${route.shortLabel}`,
              notificationBody: 'Arctic Guide is monitoring elevation and checkpoints.',
              notificationColor: colors.accent,
            },
          });
          bgStarted = true;
        }
      } catch {
        bgStarted = false;
      }

      setBackgroundServiceActive(bgStarted);
      try {
        await attachForegroundWatcher();
      } catch (err) {
        if (!bgStarted) {
          setTrackingActive(false);
          setGpsError(err instanceof Error ? err.message : 'Unable to start GPS.');
        }
      }
    },
    [attachForegroundWatcher]
  );

  const stopTracking = useCallback(async () => {
    stopForegroundWatcher();
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (started) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {}
    setBackgroundServiceActive(false);
    setTrackingActive(false);
    setTrackedRouteId(null);
    setTrailStartedAt(null);
    setAutoGatesReached({});
    setManualGatesReached({});
    await clearTrackingSession();
  }, [stopForegroundWatcher]);

  const calibrateAtParking = useCallback(
    (route: ActivityRoute) => {
      if (rawAltitudeM === null) return;
      setAltitudeOffset(route.trailhead.elevationMeters - rawAltitudeM);
      setIsCalibrated(true);
    },
    [rawAltitudeM]
  );

  const toggleManualGate = useCallback((gateId: string) => {
    setManualGatesReached((prev) => {
      const next = { ...prev };
      if (next[gateId]) {
        delete next[gateId];
      } else {
        next[gateId] = new Date();
      }
      return next;
    });
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!trackingActive || !trailStartedAt) return 0;
    return Math.max(0, Math.floor((nowMs - trailStartedAt.getTime()) / 1000));
  }, [trackingActive, trailStartedAt, nowMs]);

  const progressPct = useMemo(() => {
    if (!trackingActive || !trackedRoute) return 0;
    if (trackedRoute.trackingMode === 'distance') {
      const maxDist = Math.max(0.5, trackedRoute.totalDistanceKm);
      return Math.round(
        Math.min(100, Math.max(0, (trackMatch.distanceAlongTrackKm / maxDist) * 100))
      );
    }
    const startEle = trackedRoute.trailhead.elevationMeters;
    const topEle = trackedRoute.summit?.elevationMeters ?? startEle;
    const span = Math.max(1, topEle - startEle);
    const curEle = effectiveAltitudeM ?? startEle;
    return Math.round(Math.min(100, Math.max(0, ((curEle - startEle) / span) * 100)));
  }, [trackingActive, trackedRoute, trackMatch.distanceAlongTrackKm, effectiveAltitudeM]);

  const evaluateGatesForRoute = useCallback(
    (route: ActivityRoute, tourStartMinutes: number | null, now: Date) => {
      const activeForThisRoute = trackingActive && trackedRouteId === route.id;

      let anchorStart: Date | null = null;
      let isProjectedStart = true;

      if (activeForThisRoute && trailStartedAt) {
        anchorStart = trailStartedAt;
        isProjectedStart = false;
      } else if (tourStartMinutes !== null) {
        const trailStartMin = tourStartMinutes + route.driveMinutesEachWay;
        const d = new Date(now);
        d.setHours(Math.floor(trailStartMin / 60), trailStartMin % 60, 0, 0);
        anchorStart = d;
        isProjectedStart = true;
      }

      const gates: GateEvaluation[] = route.gates.map((gate) => {
        const targetClockTime = anchorStart
          ? new Date(anchorStart.getTime() + gate.offsetMinutes * 60000)
          : null;

        const reachedAt = activeForThisRoute
          ? manualGatesReached[gate.id] ?? autoGatesReached[gate.id] ?? null
          : null;

        let status: GatePaceStatus = 'upcoming';
        let deltaMinutes: number | null = null;

        if (reachedAt) {
          status = 'reached';
          if (targetClockTime) {
            deltaMinutes = Math.round(
              (reachedAt.getTime() - targetClockTime.getTime()) / 60000
            );
          }
        } else if (targetClockTime) {
          const diffMin = Math.round((now.getTime() - targetClockTime.getTime()) / 60000);
          if (diffMin >= 0) {
            status = gate.isTurnaround ? 'turnaround_now' : 'late';
            deltaMinutes = diffMin;
          } else {
            deltaMinutes = diffMin;
          }
        }

        let remainingText = '';
        if (reachedAt) {
          remainingText = 'Reached';
        } else if (route.trackingMode === 'distance') {
          const targetKm = gate.targetDistanceKm ?? route.totalDistanceKm;
          const left = Math.max(0, targetKm - trackMatch.distanceAlongTrackKm);
          remainingText = activeForThisRoute
            ? `${left.toFixed(1)} km left`
            : `${targetKm.toFixed(1)} km (${gate.targetElevationMeters}m)`;
        } else {
          const curEle =
            activeForThisRoute && effectiveAltitudeM !== null
              ? effectiveAltitudeM
              : route.trailhead.elevationMeters;
          const leftM = Math.max(0, gate.targetElevationMeters - curEle);
          remainingText = activeForThisRoute
            ? `+${leftM} m climb left`
            : `${gate.targetElevationMeters} m`;
        }

        return {
          gate,
          targetClockTime,
          reachedAt,
          status,
          deltaMinutes,
          remainingText,
        };
      });

      return { gates, isProjectedStart };
    },
    [
      trackingActive,
      trackedRouteId,
      trailStartedAt,
      manualGatesReached,
      autoGatesReached,
      trackMatch.distanceAlongTrackKm,
      effectiveAltitudeM,
    ]
  );

  const value: TrackingContextValue = {
    trackingActive,
    backgroundServiceActive,
    trackedRoute,
    gpsError,
    rawAltitudeM,
    effectiveAltitudeM,
    isCalibrated,
    accuracyMeters:
      sample?.accuracy !== null && sample?.accuracy !== undefined
        ? Math.round(sample.accuracy)
        : null,
    distanceAlongTrackKm: trackMatch.distanceAlongTrackKm,
    distanceOffRouteMeters: trackMatch.distanceOffRouteMeters,
    trailStartedAt,
    elapsedSeconds,
    progressPct,
    evaluateGatesForRoute,
    startTracking,
    stopTracking,
    calibrateAtParking,
    toggleManualGate,
  };

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  const ctx = useContext(TrackingContext);
  if (!ctx) {
    throw new Error('useTracking must be used inside TrackingProvider');
  }
  return ctx;
}