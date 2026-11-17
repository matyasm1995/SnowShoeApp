import { Pressable, StyleSheet, Text } from 'react-native';

import { useTracking } from '../context/TrackingContext';
import { colors } from '../theme';

interface Props {
  hidden?: boolean;
  onPress: () => void;
}

function formatElapsedCompact(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) {
    return `${hrs}h${String(remMins).padStart(2, '0')}`;
  }
  const remSecs = seconds % 60;
  return `${mins}:${String(remSecs).padStart(2, '0')}`;
}

export function FloatingTrackingBubble({ hidden = false, onPress }: Props) {
  const {
    trackingActive,
    trackedRoute,
    effectiveAltitudeM,
    distanceAlongTrackKm,
    elapsedSeconds,
  } = useTracking();

  if (!trackingActive || !trackedRoute || hidden) return null;

  const primaryValue =
    trackedRoute.trackingMode === 'distance'
      ? `${distanceAlongTrackKm.toFixed(1)}k`
      : effectiveAltitudeM !== null
        ? `${effectiveAltitudeM}m`
        : 'GPS';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Return to active GPS tracking"
      onPress={onPress}
      style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
    >
      <Text style={styles.primaryText}>{primaryValue}</Text>
      <Text style={styles.timeText}>{formatElapsedCompact(elapsedSeconds)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    borderColor: '#FFFFFF',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    zIndex: 50,
  },
  primaryText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 19,
  },
  timeText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
});