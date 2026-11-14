import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';

import type { ActivityRoute } from '../data/routes';
import { colors } from '../theme';

interface Props {
  route: ActivityRoute;
  currentDistanceKm?: number;
  currentElevationM?: number | null;
  gpsActive?: boolean;
}

export function ElevationProfileGraph({
  route,
  currentDistanceKm = 0,
  currentElevationM = null,
  gpsActive = false,
}: Props) {
  const track = route.track;
  if (track.length < 2) return null;

  const width = 320;
  const height = 132;
  const padX = 10;
  const padTop = 16;
  const padBottom = 18;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const maxDist = Math.max(0.5, route.totalDistanceKm);
  const eles = track.map((t) => t.ele);
  const gateEles = route.gates.map((g) => g.targetElevationMeters);
  const minEle = Math.min(...eles, route.trailhead.elevationMeters);
  const maxEle = Math.max(...eles, ...gateEles, minEle + 50);
  const eleSpan = Math.max(20, maxEle - minEle);

  const toX = (distKm: number) =>
    padX + Math.min(1, Math.max(0, distKm / maxDist)) * plotW;
  const toY = (ele: number) =>
    padTop + plotH - Math.min(1, Math.max(0, (ele - minEle) / eleSpan)) * plotH;

  const first = track[0]!;
  const last = track[track.length - 1]!;

  let lineD = `M ${toX(first.cumDistanceKm)} ${toY(first.ele)}`;
  for (let i = 1; i < track.length; i++) {
    const pt = track[i];
    if (!pt) continue;
    lineD += ` L ${toX(pt.cumDistanceKm)} ${toY(pt.ele)}`;
  }

  const areaPoints = [
    `${toX(first.cumDistanceKm)},${padTop + plotH}`,
    ...track.map((pt) => `${toX(pt.cumDistanceKm)},${toY(pt.ele)}`),
    `${toX(last.cumDistanceKm)},${padTop + plotH}`,
  ].join(' ');

  const dotYVal = currentElevationM ?? first.ele;
  const dotXVal =
    currentDistanceKm > 0
      ? currentDistanceKm
      : currentElevationM !== null
        ? ((currentElevationM - minEle) / eleSpan) * maxDist
        : 0;

  const dotX = toX(dotXVal);
  const dotY = toY(dotYVal);

  return (
    <View style={styles.container}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polygon points={areaPoints} fill="#082F49" opacity={0.7} />

        {route.gates.map((gate) => {
          const lineColor = gate.isTurnaround ? '#F59E0B' : '#38BDF8';
          if (route.trackingMode === 'distance' && gate.targetDistanceKm !== undefined) {
            const gx = toX(gate.targetDistanceKm);
            return (
              <Line
                key={gate.id}
                x1={gx}
                y1={padTop}
                x2={gx}
                y2={padTop + plotH}
                stroke={lineColor}
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
            );
          }

          const gy = toY(gate.targetElevationMeters);
          return (
            <Line
              key={gate.id}
              x1={padX}
              y1={gy}
              x2={width - padX}
              y2={gy}
              stroke={lineColor}
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
          );
        })}

        {route.gates.map((gate, i) => {
          const lineColor = gate.isTurnaround ? '#FBBF24' : '#7DD3FC';
          if (route.trackingMode === 'distance' && gate.targetDistanceKm !== undefined) {
            const gx = toX(gate.targetDistanceKm);
            return (
              <SvgText
                key={`${gate.id}-lbl`}
                x={Math.min(width - 42, Math.max(padX + 4, gx - 24))}
                y={padTop - 4}
                fill={lineColor}
                fontSize="9"
                fontWeight="bold"
              >
                {`${gate.targetDistanceKm.toFixed(1)}km`}
              </SvgText>
            );
          }

          const gy = toY(gate.targetElevationMeters);
          return (
            <SvgText
              key={`${gate.id}-lbl`}
              x={padX + 2 + i * 2}
              y={Math.max(10, gy - 3)}
              fill={lineColor}
              fontSize="9"
              fontWeight="bold"
            >
              {`${gate.targetElevationMeters}m`}
            </SvgText>
          );
        })}

        <Path d={lineD} fill="none" stroke="#38BDF8" strokeWidth="2.5" />

        {gpsActive ? (
          <>
            <Circle cx={dotX} cy={dotY} r="7" fill="#38BDF8" opacity={0.35} />
            <Circle cx={dotX} cy={dotY} r="4.5" fill="#FFFFFF" stroke="#38BDF8" strokeWidth="2" />
          </>
        ) : null}
      </Svg>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Start {route.trailhead.elevationMeters}m</Text>
        <Text style={styles.footerText}>
          {route.totalDistanceKm.toFixed(1)} km · Peak {maxEle}m
        </Text>
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
    padding: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
});