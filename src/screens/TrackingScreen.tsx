import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Flag,
  Navigation,
  Play,
  Square,
} from 'lucide-react-native';

import { TrailProgressBar } from '../components/TrailProgressBar';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useTracking } from '../context/TrackingContext';
import { colors, sharedStyles, touchTarget } from '../theme';
import { formatClock } from '../utils/format';

function formatElapsed(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function TrackingScreen() {
  const { activeAssignment, activeRoute } = useActiveTour();
  const {
    trackingActive,
    backgroundServiceActive,
    trackedRoute,
    gpsError,
    rawAltitudeM,
    effectiveAltitudeM,
    isCalibrated,
    accuracyMeters,
    distanceAlongTrackKm,
    distanceOffRouteMeters,
    trailStartedAt,
    elapsedSeconds,
    evaluateGatesForRoute,
    startTracking,
    stopTracking,
    calibrateAtParking,
    toggleManualGate,
  } = useTracking();

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CONFIG.weather.refreshIntervalMs);
    return () => clearInterval(timer);
  }, []);

  const activeForThisRoute = trackingActive && trackedRoute?.id === activeRoute.id;
  const { gates, isProjectedStart } = evaluateGatesForRoute(
    activeRoute,
    activeAssignment?.startMinutes ?? null,
    now
  );

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      {/* Route Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Navigation color={colors.accent} size={20} />
          <Text style={styles.headerTitle}>{activeRoute.name}</Text>
          {activeForThisRoute ? (
            <View style={styles.gpsLivePill}>
              <Text style={styles.gpsLiveText}>
                {backgroundServiceActive ? 'BG LIVE' : 'GPS LIVE'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.returnText}>{activeRoute.returnNote}</Text>
      </View>

      {/* Progress Bar (0% -> 100% Summit / Turning Point) */}
      <TrailProgressBar
        route={activeRoute}
        currentDistanceKm={activeForThisRoute ? distanceAlongTrackKm : 0}
        currentElevationM={activeForThisRoute ? effectiveAltitudeM : null}
        gpsActive={activeForThisRoute}
      />

      {/* Merged Start / Stop Tracking Button */}
      {!activeForThisRoute ? (
        <Pressable
          onPress={() => void startTracking(activeRoute)}
          style={({ pressed }) => [touchTarget, styles.btnPrimary, pressed && styles.pressed]}
        >
          <Play color={colors.background} size={20} />
          <Text style={styles.btnPrimaryText}>
            {trackingActive && trackedRoute
              ? `Switch Tracking to ${activeRoute.shortLabel}`
              : 'Start Tracking'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => calibrateAtParking(activeRoute)}
            disabled={rawAltitudeM === null}
            style={({ pressed }) => [
              touchTarget,
              styles.btnCalibrate,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.btnCalibrateTitle}>Zero at Car</Text>
            <Text style={styles.btnCalibrateSub}>
              Set {activeRoute.trailhead.elevationMeters}m
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void stopTracking()}
            style={({ pressed }) => [touchTarget, styles.btnDanger, pressed && styles.pressed]}
          >
            <Square color={colors.text} size={16} />
            <Text style={styles.btnDangerText}>Stop Tracking</Text>
          </Pressable>
        </View>
      )}

      {/* Live Telemetry */}
      {activeForThisRoute ? (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>ALTITUDE</Text>
            <Text style={styles.statVal}>
              {effectiveAltitudeM !== null ? `${effectiveAltitudeM} m` : '—'}
            </Text>
            <Text style={styles.statSub}>
              {isCalibrated ? 'Calibrated' : 'Geoid est.'}
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>PROGRESS</Text>
            <Text style={styles.statVal}>{distanceAlongTrackKm.toFixed(1)} km</Text>
            <Text style={styles.statSub}>
              of {activeRoute.totalDistanceKm.toFixed(1)} km
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>ELAPSED</Text>
            <Text style={styles.statVal}>{formatElapsed(elapsedSeconds)}</Text>
            <Text style={styles.statSub}>
              {trailStartedAt ? `From ${formatClock(trailStartedAt)}` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {activeForThisRoute && distanceOffRouteMeters !== null ? (
        <Text style={styles.offRouteText}>
          Track offset: {distanceOffRouteMeters} m
          {accuracyMeters !== null ? ` · GPS ±${accuracyMeters} m` : ''}
        </Text>
      ) : null}

      {gpsError ? <Text style={styles.errorText}>{gpsError}</Text> : null}

      {/* Checkpoint Gates */}
      <Text style={sharedStyles.sectionTitle}>Checkpoints & Turnaround</Text>
      <View style={styles.gatesList}>
        {gates.map((ev) => {
          const targetStr = ev.targetClockTime ? formatClock(ev.targetClockTime) : null;
          const statusLabel =
            ev.status === 'reached'
              ? `REACHED${ev.reachedAt ? ` ${formatClock(ev.reachedAt)}` : ''}`
              : ev.status === 'turnaround_now'
                ? 'TURN AROUND NOW'
                : ev.status === 'late'
                  ? `BEHIND (+${ev.deltaMinutes ?? 0}m)`
                  : 'ON PACE';

          return (
            <Pressable
              key={ev.gate.id}
              onPress={() => toggleManualGate(ev.gate.id)}
              style={({ pressed }) => [
                touchTarget,
                styles.gateRow,
                ev.status === 'reached' && styles.gateRowReached,
                ev.status === 'turnaround_now' && styles.gateRowTurnaround,
                ev.status === 'late' && styles.gateRowLate,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.gateLeft}>
                <View style={styles.gateTitleRow}>
                  <Flag
                    color={
                      ev.status === 'turnaround_now'
                        ? colors.danger
                        : ev.status === 'reached'
                          ? colors.success
                          : colors.accent
                    }
                    size={18}
                  />
                  <Text style={styles.gateTitle}>{ev.gate.label}</Text>
                </View>
                <Text style={styles.gateDetail}>
                  +{Math.floor(ev.gate.offsetMinutes / 60)}h{' '}
                  {String(ev.gate.offsetMinutes % 60).padStart(2, '0')}m
                  {targetStr
                    ? ` (${isProjectedStart ? '~' : ''}${targetStr})`
                    : ''}{' '}
                  · {ev.remainingText}
                </Text>
              </View>

              <View
                style={[
                  styles.gateStatusPill,
                  ev.status === 'reached' && { backgroundColor: '#064E3B' },
                  ev.status === 'turnaround_now' && { backgroundColor: '#7F1D1D' },
                  ev.status === 'late' && { backgroundColor: '#78350F' },
                ]}
              >
                <Text
                  style={[
                    styles.gateStatusText,
                    ev.status === 'reached' && { color: colors.success },
                    ev.status === 'turnaround_now' && { color: '#FCA5A5' },
                    ev.status === 'late' && { color: colors.warning },
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
  returnText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  gpsLivePill: {
    backgroundColor: '#064E3B',
    borderColor: colors.success,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gpsLiveText: { color: colors.success, fontSize: 10, fontWeight: '800' },
  btnPrimary: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  btnPrimaryText: { color: colors.background, fontSize: 17, fontWeight: '800' },
  controlsRow: { flexDirection: 'row', gap: 10 },
  btnCalibrate: {
    flex: 1,
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  btnCalibrateTitle: { color: colors.accentSoft, fontSize: 14, fontWeight: '800' },
  btnCalibrateSub: { color: colors.text, fontSize: 11, fontWeight: '700' },
  btnDanger: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#7F1D1D',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  btnDangerText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  statVal: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  statSub: { color: colors.textSecondary, fontSize: 11 },
  offRouteText: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  gatesList: { gap: 10 },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  gateRowReached: { borderColor: colors.success, backgroundColor: '#022C22' },
  gateRowTurnaround: { borderColor: colors.danger, backgroundColor: '#450A0A' },
  gateRowLate: { borderColor: colors.warning, backgroundColor: '#451A03' },
  gateLeft: { flex: 1, gap: 3 },
  gateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gateTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  gateDetail: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  gateStatusPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gateStatusText: { color: colors.ice, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});