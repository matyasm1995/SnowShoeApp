import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { colors } from '../theme';
import { calculateWindRelativeExposure } from '../utils/environmental';

interface Props {
  windFromDeg: number | null;
  windSpeedMs: number;
  windGustMs: number;
  ascentBearingDeg: number;
}

export function WindCompass({ windFromDeg, windSpeedMs, windGustMs, ascentBearingDeg }: Props) {
  const size = 110;
  const center = size / 2;
  const radius = center - 8;

  const exposure = calculateWindRelativeExposure(ascentBearingDeg, windFromDeg);
  const windAngle = windFromDeg ?? 0;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.label}>WIND & EXPOSURE</Text>
        <Text style={styles.speed}>
          {windSpeedMs.toFixed(1)} <Text style={styles.unit}>m/s</Text>
        </Text>
        <Text style={styles.gust}>
          Gusts up to <Text style={styles.gustHighlight}>{Math.round(windGustMs)} m/s</Text>
        </Text>
        <View style={styles.exposureBadge}>
          <Text style={styles.exposureText}>{exposure}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Compass Rose Ring */}
          <Circle cx={center} cy={center} r={radius} stroke="#27272A" strokeWidth="2" fill="#09090B" />
          <SvgText x={center} y={15} fill="#A1A1AA" fontSize="10" fontWeight="bold" textAnchor="middle">N</SvgText>
          <SvgText x={size - 12} y={center + 3} fill="#A1A1AA" fontSize="10" fontWeight="bold" textAnchor="middle">E</SvgText>
          <SvgText x={center} y={size - 7} fill="#A1A1AA" fontSize="10" fontWeight="bold" textAnchor="middle">S</SvgText>
          <SvgText x={12} y={center + 3} fill="#A1A1AA" fontSize="10" fontWeight="bold" textAnchor="middle">W</SvgText>

          {/* Route Ascent Direction (Cyan Dashed Line) */}
          <G rotation={ascentBearingDeg} origin={`${center}, ${center}`}>
            <Line x1={center} y1={center} x2={center} y2={18} stroke="#38BDF8" strokeWidth="2.5" strokeDasharray="3 3" />
            <Polygon points={`${center},14 ${center - 4},22 ${center + 4},22`} fill="#38BDF8" />
          </G>

          {/* Wind Arrow (Direction Wind Blows FROM -> Deep Red/Orange) */}
          <G rotation={windAngle} origin={`${center}, ${center}`}>
            <Line x1={center} y1={center} x2={center} y2={22} stroke="#EF4444" strokeWidth="3" />
            <Polygon points={`${center},18 ${center - 5},28 ${center + 5},28`} fill="#EF4444" />
          </G>
        </Svg>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flex: 1, gap: 4 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  speed: { color: colors.text, fontSize: 32, fontWeight: '800' },
  unit: { color: colors.textSecondary, fontSize: 16 },
  gust: { color: colors.textSecondary, fontSize: 13 },
  gustHighlight: { color: '#F59E0B', fontWeight: '800' },
  exposureBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  exposureText: { color: '#38BDF8', fontSize: 12, fontWeight: '700' },
  right: { alignItems: 'center', justifyContent: 'center' },
});