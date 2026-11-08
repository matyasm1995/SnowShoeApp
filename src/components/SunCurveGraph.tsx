import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { get24HourSunCurve } from '../utils/environmental';
import { colors } from '../theme';

interface Props {
  now?: Date;
}

export function SunCurveGraph({ now = new Date() }: Props) {
  const curve = useMemo(() => get24HourSunCurve(now), [now]);

  const width = 300;
  const height = 120;
  const minAlt = -25;
  const maxAlt = 15;
  const altRange = maxAlt - minAlt;

  const toY = (alt: number) => height - ((alt - minAlt) / altRange) * height;
  const toX = (hour: number) => (hour / 24) * width;

  const yHorizon = toY(0);
  const yCivil = toY(-6);
  const yNautical = toY(-12);

  // Build SVG path string
  let pathD = `M ${toX(curve[0]!.hour)} ${toY(curve[0]!.altitudeDeg)}`;
  for (let i = 1; i < curve.length; i++) {
    pathD += ` L ${toX(curve[i]!.hour)} ${toY(curve[i]!.altitudeDeg)}`;
  }

  // Current sun position dot
  const currentHourDecimal = now.getHours() + now.getMinutes() / 60;
  const currentPos = curve[Math.floor(currentHourDecimal)] ?? curve[12]!;
  const dotX = toX(currentHourDecimal);
  const dotY = toY(currentPos.altitudeDeg);

  return (
    <View style={styles.container}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Background twilight bands */}
        <Rect x="0" y="0" width={width} height={yHorizon} fill="#1E293B" opacity={0.3} />
        <Rect x="0" y={yHorizon} width={width} height={yCivil - yHorizon} fill="#312E81" opacity={0.35} />
        <Rect x="0" y={yCivil} width={width} height={yNautical - yCivil} fill="#1E1B4B" opacity={0.4} />
        <Rect x="0" y={yNautical} width={width} height={height - yNautical} fill="#09090B" />

        {/* Reference Horizon Lines */}
        <Line x1="0" y1={yHorizon} x2={width} y2={yHorizon} stroke="#FBBF24" strokeWidth="1" strokeDasharray="4 4" />
        <SvgText x={width - 45} y={yHorizon - 3} fill="#FBBF24" fontSize="9" fontWeight="bold">0° Horizon</SvgText>

        <Line x1="0" y1={yCivil} x2={width} y2={yCivil} stroke="#38BDF8" strokeWidth="0.8" strokeDasharray="3 3" />
        <SvgText x={width - 45} y={yCivil - 3} fill="#38BDF8" fontSize="8">-6° Civil</SvgText>

        <Line x1="0" y1={yNautical} x2={width} y2={yNautical} stroke="#818CF8" strokeWidth="0.8" strokeDasharray="3 3" />
        <SvgText x={width - 55} y={yNautical - 3} fill="#818CF8" fontSize="8">-12° Nautical</SvgText>

        {/* Solar Path Sine Curve */}
        <Path d={pathD} fill="none" stroke="#FFFFFF" strokeWidth="2.5" />

        {/* NOW Indicator Dot */}
        <Circle cx={dotX} cy={dotY} r="5" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="2" />
      </Svg>

      <View style={styles.legendRow}>
        <Text style={styles.legendText}>00:00</Text>
        <Text style={styles.legendText}>06:00</Text>
        <Text style={[styles.legendText, { color: colors.accent }]}>Midday (12:00)</Text>
        <Text style={styles.legendText}>18:00</Text>
        <Text style={styles.legendText}>24:00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#09090B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
});