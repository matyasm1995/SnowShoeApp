import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  haversineKm,
  type ActivityRoute,
  type CheckpointGate,
} from '../data/routes';

const TROMSO_DEFAULT_GEOID_OFFSET_M = -32;

export type GatePaceStatus = 'upcoming' | 'reached' | 'late' | 'turnaround_now';

export interface GateEvaluation {
  gate: CheckpointGate;
  targetClockTime: Date | null;
  reachedAt: Date | null;
  status: GatePaceStatus;
  deltaMinutes: number | null;
  remainingText: string;
}

export interface PacingTelemetry {
  gpsEnabled: boolean;
  permissionDenied: boolean;
  gpsError: string | null;
  rawAltitudeM: number | null;
  effectiveAltitudeM: number | null;
  isCalibrated: boolean;
  accuracyMeters: number | null;
  distanceFromParkingKm: number | null;
  distanceAlongTrackKm: number;
  distanceOffRouteMeters: number | null;
  nearestTrackEleM: number | null;
  trailStartedAt: Date | null;
  isProjectedStart: boolean;
  gates: GateEvaluation[];
  enableGps: () => Promise<void>;
  disableGps: () => void;
  calibrateAtParking: () => void;
  startTrailNow: () => void;
  resetTrail: () => void;
  toggleManualGate: (gateId: string) => void;
}

function defaultStartTimeForTour(
  tourStartMinutes: number | null,
  driveMinutesEachWay: number,
  now: Date
): { start: Date; isProjected: boolean } | null {
  if (tourStartMinutes === null) return null;
  const trailStartMin = tourStartMinutes + driveMinutesEachWay;
  const d = new Date(now);
  d.setHours(Math.floor(trailStartMin / 60), trailStartMin % 60, 0, 0);
  return { start: d, isProjected: true };
}

export function useLocationPacing(
  route: ActivityRoute,
  tourStartMinutes: number | null,
  now: Date
): PacingTelemetry {
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{
    lat: number;
    lon: number;
    alt: number | null;
    accuracy: number | null;
  } | null>(null);

  const [altitudeOffset, setAltitudeOffset] = useState<number>(TROMSO_DEFAULT_GEOID_OFFSET_M);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [trailStartedAt, setTrailStartedAt] = useState<Date | null>(null);
  const [autoGatesReached, setAutoGatesReached] = useState<Record<string, Date>>({});
  const [manualGatesReached, setManualGatesReached] = useState<Record<string, Date>>({});

  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  const stopWatcher = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    setGpsEnabled(false);
  }, []);

  useEffect(() => {
    setAutoGatesReached({});
    setManualGatesReached({});
    setIsCalibrated(false);
    setAltitudeOffset(TROMSO_DEFAULT_GEOID_OFFSET_M);
  }, [route.id]);

  useEffect(() => {
    return () => {
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
    };
  }, []);

  const enableGps = useCallback(async () => {
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setGpsError('Location permission denied.');
        return;
      }
      setPermissionDenied(false);

      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }

      setGpsEnabled(true);

      const handleLocation = (loc: Location.LocationObject) => {
        setCoords({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          alt: loc.coords.altitude,
          accuracy: loc.coords.accuracy,
        });
      };

      try {
        const quick = await Location.getLastKnownPositionAsync();
        if (quick) handleLocation(quick);
      } catch {}

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 4000,
          distanceInterval: 8,
        },
        handleLocation
      );
    } catch (err) {
      setGpsEnabled(false);
      setGpsError(err instanceof Error ? err.message : 'Unable to start GPS.');
    }
  }, []);

  const disableGps = useCallback(() => {
    stopWatcher();
  }, [stopWatcher]);

  const rawAltitudeM =
    coords?.alt !== null && coords?.alt !== undefined ? Math.round(coords.alt) : null;

  const effectiveAltitudeM = useMemo(() => {
    if (rawAltitudeM === null) return null;
    return Math.round(rawAltitudeM + altitudeOffset);
  }, [rawAltitudeM, altitudeOffset]);

  const calibrateAtParking = useCallback(() => {
    if (rawAltitudeM === null) return;
    setAltitudeOffset(route.trailhead.elevationMeters - rawAltitudeM);
    setIsCalibrated(true);
  }, [rawAltitudeM, route.trailhead.elevationMeters]);

  const startTrailNow = useCallback(() => {
    setTrailStartedAt(new Date());
    setAutoGatesReached({});
    setManualGatesReached({});
    if (rawAltitudeM !== null && coords) {
      const distKm = haversineKm(
        coords.lat,
        coords.lon,
        route.trailhead.latitude,
        route.trailhead.longitude
      );
      if (distKm < 0.35) {
        setAltitudeOffset(route.trailhead.elevationMeters - rawAltitudeM);
        setIsCalibrated(true);
      }
    }
  }, [rawAltitudeM, coords, route.trailhead]);

  const resetTrail = useCallback(() => {
    setTrailStartedAt(null);
    setAutoGatesReached({});
    setManualGatesReached({});
  }, []);

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

  const trackMatch = useMemo(() => {
    if (!coords) {
      return {
        distanceFromParkingKm: null as number | null,
        distanceAlongTrackKm: 0,
        distanceOffRouteMeters: null as number | null,
        nearestTrackEleM: null as number | null,
      };
    }

    const distToParking =
      Math.round(
        haversineKm(
          coords.lat,
          coords.lon,
          route.trailhead.latitude,
          route.trailhead.longitude
        ) * 100
      ) / 100;

    if (route.track.length === 0) {
      return {
        distanceFromParkingKm: distToParking,
        distanceAlongTrackKm: 0,
        distanceOffRouteMeters: null,
        nearestTrackEleM: null,
      };
    }

    let bestDistKm = Infinity;
    let bestAlongKm = 0;
    let bestEle = route.trailhead.elevationMeters;

    for (let i = 0; i < route.track.length; i++) {
      const pt = route.track[i];
      if (!pt) continue;
      const d = haversineKm(coords.lat, coords.lon, pt.lat, pt.lon);
      if (d < bestDistKm) {
        bestDistKm = d;
        bestAlongKm = pt.cumDistanceKm;
        bestEle = pt.ele;
      }
    }

    return {
      distanceFromParkingKm: distToParking,
      distanceAlongTrackKm: bestAlongKm,
      distanceOffRouteMeters: Math.round(bestDistKm * 1000),
      nearestTrackEleM: bestEle,
    };
  }, [coords, route.track, route.trailhead]);

  useEffect(() => {
    if (!gpsEnabled || !coords) return;

    const nearRoute =
      trackMatch.distanceOffRouteMeters === null || trackMatch.distanceOffRouteMeters <= 400;

    if (!nearRoute) return;

    const currentElev = effectiveAltitudeM ?? trackMatch.nearestTrackEleM;

    for (const gate of route.gates) {
      if (autoGatesReached[gate.id] || manualGatesReached[gate.id]) continue;

      let reached = false;
      if (route.trackingMode === 'distance') {
        const targetDist = gate.targetDistanceKm ?? route.totalDistanceKm;
        if (gate.lat !== undefined && gate.lon !== undefined) {
          const distToGateM = haversineKm(coords.lat, coords.lon, gate.lat, gate.lon) * 1000;
          if (distToGateM <= 180) reached = true;
        }
        if (trackMatch.distanceAlongTrackKm >= targetDist - 0.2) reached = true;
      } else if (route.trackingMode === 'elevation') {
        if (currentElev !== null && currentElev >= gate.targetElevationMeters - 10) {
          reached = true;
        }
      }

      if (reached) {
        setAutoGatesReached((prev) => ({ ...prev, [gate.id]: new Date() }));
      }
    }
  }, [
    gpsEnabled,
    coords,
    effectiveAltitudeM,
    trackMatch,
    route.gates,
    route.trackingMode,
    route.totalDistanceKm,
    autoGatesReached,
    manualGatesReached,
  ]);

  const effectiveAnchor = useMemo(() => {
    if (trailStartedAt) return { start: trailStartedAt, isProjected: false };
    return defaultStartTimeForTour(tourStartMinutes, route.driveMinutesEachWay, now);
  }, [trailStartedAt, tourStartMinutes, route.driveMinutesEachWay, now]);

  const gates: GateEvaluation[] = useMemo(() => {
    return route.gates.map((gate) => {
      const targetClockTime = effectiveAnchor
        ? new Date(effectiveAnchor.start.getTime() + gate.offsetMinutes * 60000)
        : null;

      const reachedAt = manualGatesReached[gate.id] ?? autoGatesReached[gate.id] ?? null;

      let status: GatePaceStatus = 'upcoming';
      let deltaMinutes: number | null = null;

      if (reachedAt) {
        status = 'reached';
        if (targetClockTime) {
          deltaMinutes = Math.round((reachedAt.getTime() - targetClockTime.getTime()) / 60000);
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
        remainingText = gpsEnabled
          ? `${left.toFixed(1)} km left`
          : `${targetKm.toFixed(1)} km (${gate.targetElevationMeters}m)`;
      } else {
        const curEle = effectiveAltitudeM ?? route.trailhead.elevationMeters;
        const leftM = Math.max(0, gate.targetElevationMeters - curEle);
        remainingText = gpsEnabled
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
  }, [
    route.gates,
    route.trackingMode,
    route.totalDistanceKm,
    route.trailhead.elevationMeters,
    effectiveAnchor,
    manualGatesReached,
    autoGatesReached,
    now,
    gpsEnabled,
    effectiveAltitudeM,
    trackMatch.distanceAlongTrackKm,
  ]);

  return {
    gpsEnabled,
    permissionDenied,
    gpsError,
    rawAltitudeM,
    effectiveAltitudeM,
    isCalibrated,
    accuracyMeters:
      coords?.accuracy !== null && coords?.accuracy !== undefined
        ? Math.round(coords.accuracy)
        : null,
    distanceFromParkingKm: trackMatch.distanceFromParkingKm,
    distanceAlongTrackKm: trackMatch.distanceAlongTrackKm,
    distanceOffRouteMeters: trackMatch.distanceOffRouteMeters,
    nearestTrackEleM: trackMatch.nearestTrackEleM,
    trailStartedAt,
    isProjectedStart: effectiveAnchor?.isProjected ?? true,
    gates,
    enableGps,
    disableGps,
    calibrateAtParking,
    startTrailNow,
    resetTrail,
    toggleManualGate,
  };
}