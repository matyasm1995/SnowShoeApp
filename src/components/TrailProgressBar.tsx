import { StyleSheet, Text, View } from 'react-native';

import type { ActivityRoute } from '../data/routes';
import { colors } from '../theme';

interface Props {
  route: ActivityRoute;
  currentDistanceKm: number;
  currentElevationM: number | null;
  gpsActive: boolean;
}

export function TrailProgressBar({
  route,
  currentDistanceKm,
  currentElevationM,
  gpsActive,
}: Props) {
  const isDistance = route.trackingMode === 'distance';
  const startEle = route.trailhead.elevationMeters;
  const topEle =
    route.summit?.elevationMeters ??
    route.gates[route.gates.length - 1]?.targetElevationMeters ??
    startEle + 100;
  const totalKm = Math.max(0.5, route.totalDistanceKm);

  const rawPct = isDistance
    ? (currentDistanceKm / totalKm) * 100
    : currentElevationM !== null
      ? ((currentElevationM - startEle) / Math.max(1, topEle - startEle)) * 100
      : 0;

  const pct = gpsActive ? Math.min(100, Math.max(0, Math.round(rawPct))) : 0;
  const barColor = pct >= 100 ? colors.success : colors.accent;

  const gateMarkers = route.gates.map((gate) => {
    const gPct = isDistance
      ? ((gate.targetDistanceKm ?? totalKm) / totalKm) * 100
      : ((gate.targetElevationMeters - startEle) / Math.max(1, topEle - startEle)) * 100;
    return {
      id: gate.id,
      pct: Math.min(100, Math.max(0, gPct)),
      label: isDistance
        ? `${(gate.targetDistanceKm ?? totalKm).toFixed(1)}km`
        : `${gate.targetElevationMeters}m`,
      isTurnaround: Boolean(gate.isTurnaround),
    };
  });

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.title}>
          {isDistance ? 'ROUTE TO TURNING POINT' : 'CLIMB TO SUMMIT'}
        </Text>
        <Text style={[styles.pctText, { color: barColor }]}>
          {pct}%
        </Text>
      </View>

      <View style={styles.trackWrap}>
        <View style={styles.trackBg}>
          <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>

        {gateMarkers.map((g) => (
          <View
            key={g.id}
            style={[
              styles.gateTick,
              {
                left: `${g.pct}%`,
                backgroundColor: g.isTurnaround ? colors.warning : colors.ice,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.labelsRow}>
        <Text style={styles.endLabel}>
          {isDistance ? '0.0 km (0%)' : `${startEle}m (0%)`}
        </Text>
        {gateMarkers
          .filter((g) => g.pct > 10 && g.pct < 92)
          .map((g) => (
            <Text key={`${g.id}-lbl`} style={styles.gateLabel}>
              {g.label}
            </Text>
          ))}
        <Text style={styles.endLabel}>
          {isDistance ? `${totalKm.toFixed(1)} km (100%)` : `${topEle}m (100%)`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  pctText: { fontSize: 22, fontWeight: '800' },
  trackWrap: {
    position: 'relative',
    height: 18,
    justifyContent: 'center',
  },
  trackBg: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
  },
  gateTick: {
    position: 'absolute',
    width: 3,
    height: 18,
    borderRadius: 2,
    marginLeft: -1.5,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  endLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  gateLabel: { color: colors.ice, fontSize: 11, fontWeight: '800' },
});