import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { colors } from '../theme';
import { windCardinal } from '../utils/environmental';

interface Props {
  windFromDeg: number | null;
  windSpeedMs: number;
  windGustMs: number;
  ascentBearingDeg?: number;
}

export function WindCompass({ windFromDeg, windSpeedMs, windGustMs }: Props) {
  const size = 86;
  const center = size / 2;
  const radius = center - 6;

  // Arrow spans across the full circle pointing where the wind blows TO:
  // e.g. West wind (270°) -> blowToDeg = 90° -> arrow from 9 o'clock to 3 o'clock.
  const blowToDeg = windFromDeg !== null ? (windFromDeg + 180) % 360 : 0;
  const fromLabel =
    windFromDeg !== null
      ? `From ${windCardinal(windFromDeg)} (${Math.round(windFromDeg)}°)`
      : 'Direction —';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.label}>WIND</Text>
        <Text style={styles.dirText}>{fromLabel}</Text>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.metricsCol}>
          <Text style={styles.speed}>
            {windSpeedMs.toFixed(1)}
            <Text style={styles.unit}> m/s</Text>
          </Text>
          <Text style={styles.gust}>
            Gust <Text style={styles.gustVal}>{Math.round(windGustMs)} m/s</Text>
          </Text>
        </View>

        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.border}
            strokeWidth="2"
            fill="#09090B"
          />
          <SvgText
            x={center}
            y={14}
            fill={colors.textSecondary}
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
          >
            N
          </SvgText>
          <SvgText
            x={size - 10}
            y={center + 3}
            fill={colors.textSecondary}
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
          >
            E
          </SvgText>
          <SvgText
            x={center}
            y={size - 7}
            fill={colors.textSecondary}
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
          >
            S
          </SvgText>
          <SvgText
            x={10}
            y={center + 3}
            fill={colors.textSecondary}
            fontSize="9"
            fontWeight="bold"
            textAnchor="middle"
          >
            W
          </SvgText>

          {windFromDeg !== null ? (
            <G rotation={blowToDeg} origin={`${center}, ${center}`}>
              <Line
                x1={center}
                y1={size - 14}
                x2={center}
                y2={18}
                stroke={colors.danger}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <Polygon
                points={`${center},12 ${center - 5.5},23 ${center + 5.5},23`}
                fill={colors.danger}
              />
            </G>
          ) : null}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    gap: 6,
  },
  topRow: {
    gap: 2,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dirText: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  metricsCol: {
    flex: 1,
    gap: 2,
  },
  speed: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  unit: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  gust: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  gustVal: {
    color: colors.warning,
    fontWeight: '800',
  },
});