import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, Cloud, ExternalLink, Mountain, Snowflake, Sun, Sunrise, Sunset } from 'lucide-react-native';

import { getChecklist } from '../data/checklists';
import {
  KATTFJORDEIDET_CAMERAS_URL,
  LOCATIONS,
  pointFor,
  type ElevationMode,
  type TourLocation,
} from '../data/locations';
import { useChecklist } from '../hooks/useChecklist';
import { useForecast } from '../hooks/useForecast';
import type { HourlyForecastItem } from '../services/weatherService';
import { colors, sharedStyles, spacing, touchTarget } from '../theme';
import {
  calculateWindChill,
  estimateFreshSnowCm,
  estimateSnowlineMeters,
  exposureRisk,
  metersPerSecondToKmh,
  tromsoDaylight,
  windChillApplies,
} from '../utils/environmental';
import {
  formatClock,
  formatCountdown,
  formatTemperature,
} from '../utils/format';

import { WeatherIcon } from '../components/WeatherIcon';
import { SunCurveGraph } from '../components/SunCurveGraph';
import { WindCompass } from '../components/WindCompass';

export function WeatherScreen() {
  const [locationId, setLocationId] = useState<string>(LOCATIONS[0]?.id ?? 'charlottenlund');
  const [elevation, setElevation] = useState<ElevationMode>('trailhead');
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number>(0);
  const [now, setNow] = useState(() => new Date());

  const location = LOCATIONS.find((item) => item.id === locationId) ?? LOCATIONS[0]!;

  return (
    <WeatherBody
      location={location}
      elevation={location.summit ? elevation : 'trailhead'}
      now={now}
      selectedTimeIndex={selectedTimeIndex}
      onSelectTimeIndex={setSelectedTimeIndex}
      onSelectLocation={(next) => {
        setLocationId(next.id);
        setSelectedTimeIndex(0);
        if (!next.summit) setElevation('trailhead');
      }}
      onSelectElevation={(mode) => {
        setElevation(mode);
        setSelectedTimeIndex(0);
      }}
      onTick={setNow}
    />
  );
}

function WeatherBody({
  location,
  elevation,
  now,
  selectedTimeIndex,
  onSelectTimeIndex,
  onSelectLocation,
  onSelectElevation,
  onTick,
}: {
  location: TourLocation;
  elevation: ElevationMode;
  now: Date;
  selectedTimeIndex: number;
  onSelectTimeIndex: (idx: number) => void;
  onSelectLocation: (loc: TourLocation) => void;
  onSelectElevation: (mode: ElevationMode) => void;
  onTick: (d: Date) => void;
}) {
  const point = pointFor(location, elevation);
  const forecast = useForecast(point);
  const checklist = getChecklist(location.checklistId);
  const checks = useChecklist(location.checklistId);
  const daylight = useMemo(() => tromsoDaylight(now), [now]);

  useEffect(() => {
    const timer = setInterval(() => onTick(new Date()), 30000);
    return () => clearInterval(timer);
  }, [onTick]);

  const hourlyList = forecast.result?.hourly ?? [];
  const activeConditions: HourlyForecastItem | null =
    hourlyList[selectedTimeIndex] ?? forecast.result?.current ?? null;

  const windKmh = activeConditions ? metersPerSecondToKmh(activeConditions.windSpeedMs) : null;
  const felt =
    activeConditions && windKmh !== null
      ? calculateWindChill(activeConditions.airTemperatureC, windKmh)
      : null;
  const chillApplies =
    activeConditions && windKmh !== null
      ? windChillApplies(activeConditions.airTemperatureC, windKmh)
      : false;
  const exposure = felt !== null ? exposureRisk(felt) : null;
  const completed = checklist.items.filter((item) => checks.checked[item.id]).length;

  const freshSnowDepth = activeConditions
    ? estimateFreshSnowCm(activeConditions.precipitationMm, activeConditions.airTemperatureC)
    : 0;

  // Snowline estimate
  const snowlineInfo = useMemo(() => {
    const tHead = activeConditions?.airTemperatureC ?? 0;
    const tSummit = elevation === 'summit' ? tHead : tHead - 3.5;
    return estimateSnowlineMeters(
      location.trailhead.elevationMeters,
      tHead,
      location.summit?.elevationMeters ?? null,
      tSummit
    );
  }, [activeConditions, elevation, location]);

  const activeTimeLabel = activeConditions
    ? new Date(activeConditions.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      refreshControl={
        <RefreshControl
          refreshing={forecast.loading && forecast.result !== null}
          onRefresh={forecast.reload}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Location Selector Pills */}
      <View style={styles.pillRow}>
        {LOCATIONS.map((item) => {
          const selected = item.id === location.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelectLocation(item)}
              style={({ pressed }) => [
                touchTarget,
                styles.pill,
                selected && styles.pillSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {item.place}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 2. Elevation Selector */}
      {location.summit ? (
        <View style={styles.toggleRow}>
          <ElevationButton
            label={`Parking (${location.trailhead.elevationMeters}m)`}
            selected={elevation === 'trailhead'}
            onPress={() => onSelectElevation('trailhead')}
          />
          <ElevationButton
            label={`Summit (${location.summit.elevationMeters}m)`}
            selected={elevation === 'summit'}
            onPress={() => onSelectElevation('summit')}
          />
        </View>
      ) : null}

      {/* 3. Hourly Scroller with Native Weather Symbols */}
      {hourlyList.length > 0 ? (
        <View style={styles.timelineSection}>
          <Text style={styles.timelineHeader}>
            TIMELINE {selectedTimeIndex === 0 ? '(NOW)' : `(${activeTimeLabel})`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
            {hourlyList.map((hourItem, idx) => {
              const isSelected = idx === selectedTimeIndex;
              const timeString =
                idx === 0
                  ? 'Now'
                  : new Date(hourItem.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
              return (
                <Pressable
                  key={hourItem.time}
                  onPress={() => onSelectTimeIndex(idx)}
                  style={[styles.hourCard, isSelected && styles.hourCardSelected]}
                >
                  <Text style={[styles.hourTime, isSelected && styles.hourTimeSelected]}>{timeString}</Text>
                  <WeatherIcon symbolCode={hourItem.symbolCode} size={28} />
                  <Text style={styles.hourTemp}>{Math.round(hourItem.airTemperatureC)}°</Text>
                  {hourItem.precipitationMm > 0 ? (
                    <Text style={styles.hourRainText}>{hourItem.precipitationMm.toFixed(1)}mm</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {forecast.loading && !activeConditions ? (
        <View style={[sharedStyles.card, touchTarget, styles.loading]}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={sharedStyles.secondary}>Loading MET forecast</Text>
        </View>
      ) : null}

      {/* 4. Temperature & Felt Wind Chill Hero Card */}
      {activeConditions && felt !== null && exposure ? (
        <View style={[styles.badge, { backgroundColor: exposure.backgroundColor, borderColor: exposure.color }]}>
          <View style={styles.badgeTop}>
            <Text style={[styles.badgeTemp, { color: exposure.color }]}>
              {formatTemperature(activeConditions.airTemperatureC)}
            </Text>
            <View style={styles.badgeFeltCol}>
              <Text style={styles.badgeFeltLabel}>FELT WIND-CHILL</Text>
              <Text style={[styles.badgeFeltVal, { color: exposure.color }]}>
                {formatTemperature(felt)}
              </Text>
            </View>
          </View>
          <Text style={[styles.badgeLabel, { color: exposure.color }]}>{exposure.label}</Text>
          <Text style={styles.badgeDetail}>{exposure.detail}</Text>
        </View>
      ) : null}

      {/* 5. Wind Compass with Route Vector & Gusts */}
      {activeConditions ? (
        <WindCompass
          windFromDeg={activeConditions.windFromDirectionDeg}
          windSpeedMs={activeConditions.windSpeedMs}
          windGustMs={activeConditions.windGustMs}
          ascentBearingDeg={location.ascentBearingDeg}
        />
      ) : null}

      {/* 6. Snow Line & Fresh Powder Alert */}
      <View style={styles.snowRow}>
        <View style={[sharedStyles.card, styles.snowCard]}>
          <Mountain color={colors.accent} size={22} />
          <Text style={styles.snowCardTitle}>FREEZING LINE</Text>
          <Text style={styles.snowCardValue}>
            {snowlineInfo.snowlineMeters ? `${snowlineInfo.snowlineMeters} m` : 'Sea Level'}
          </Text>
          <Text style={styles.snowCardDetail}>{snowlineInfo.label}</Text>
        </View>

        <View style={[sharedStyles.card, styles.snowCard]}>
          <Snowflake color="#38BDF8" size={22} />
          <Text style={styles.snowCardTitle}>FRESH POWDER</Text>
          <Text style={styles.snowCardValue}>
            {freshSnowDepth > 0 ? `+${freshSnowDepth} cm` : '0 cm'}
          </Text>
          <Text style={styles.snowCardDetail}>
            {activeConditions?.cloudCoverPct}% Cloud cover
          </Text>
        </View>
      </View>

      {/* 7. Sun Curve (Solar Arc relative to Horizon) */}
      <View style={sharedStyles.card}>
        <View style={styles.daylightHeader}>
          <Sun color={colors.accent} size={22} />
          <Text style={styles.daylightLabel}>{daylight.label}</Text>
          <Text style={styles.countdown}>
            {formatCountdown(daylight.remainingMs)}
            {daylight.remainingMs !== null ? ` to ${daylight.countdownLabel.toLowerCase()}` : ''}
          </Text>
        </View>

        <SunCurveGraph now={now} />

        <View style={styles.clockGrid}>
          <Clock label="Sunrise" value={formatClock(daylight.clocks.sunrise)} icon={<Sunrise color={colors.accent} size={16} />} />
          <Clock label="Sunset" value={formatClock(daylight.clocks.sunset)} icon={<Sunset color={colors.accent} size={16} />} />
          <Clock label="Civil dawn" value={formatClock(daylight.clocks.civilDawn)} />
          <Clock label="Civil dusk" value={formatClock(daylight.clocks.civilDusk)} />
        </View>
      </View>

      {/* 8. Road Camera Link */}
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(KATTFJORDEIDET_CAMERAS_URL)}
        style={({ pressed }) => [touchTarget, styles.roadButton, pressed && styles.pressed]}
      >
        <ExternalLink color={colors.background} size={22} />
        <Text style={styles.roadText}>Fv862 Kattfjordeidet — Road Cameras</Text>
      </Pressable>

      {/* 9. Linked Checklist */}
      <Text style={sharedStyles.sectionTitle}>{checklist.title}</Text>
      <Text style={sharedStyles.secondary}>
        Today’s gear · {completed}/{checklist.items.length} packed
      </Text>
      {checklist.items.map((item) => {
        const checked = Boolean(checks.checked[item.id]);
        return (
          <Pressable
            key={item.id}
            onPress={() => checks.toggle(item.id)}
            style={({ pressed }) => [touchTarget, styles.checkRow, pressed && styles.pressed]}
          >
            <View style={styles.checkInner}>
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked ? <Check color={colors.background} size={22} strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.checkLabel, checked && styles.checkLabelDone]}>{item.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ElevationButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        touchTarget,
        styles.elevation,
        selected && styles.elevationSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.elevationText, selected && styles.elevationTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Clock({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <View style={styles.clock}>
      <View style={styles.clockHeader}>
        {icon}
        <Text style={styles.clockValue}>{value}</Text>
      </View>
      <Text style={styles.clockLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillSelected: { borderColor: colors.accent, backgroundColor: '#082F49' },
  pillText: { color: colors.textSecondary, fontSize: 16, fontWeight: '700' },
  pillTextSelected: { color: colors.accent },
  toggleRow: { flexDirection: 'row', gap: 8 },
  elevation: { flex: 1, paddingHorizontal: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  elevationSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  elevationText: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  elevationTextSelected: { color: colors.background },
  timelineSection: { gap: 8 },
  timelineHeader: { color: colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  timelineScroll: { gap: 10, paddingVertical: 4 },
  hourCard: {
    minWidth: 78,
    minHeight: 96,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  hourCardSelected: { borderColor: colors.accent, backgroundColor: '#0C4A6E' },
  hourTime: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  hourTimeSelected: { color: colors.accent },
  hourTemp: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hourRainText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  loading: { gap: 12 },
  badge: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    gap: 4,
  },
  badgeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeTemp: { fontSize: 38, fontWeight: '800' },
  badgeFeltCol: { alignItems: 'flex-end' },
  badgeFeltLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  badgeFeltVal: { fontSize: 26, fontWeight: '800' },
  badgeLabel: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  badgeDetail: { color: colors.text, fontSize: 14 },
  snowRow: { flexDirection: 'row', gap: spacing.gap },
  snowCard: { flex: 1, minHeight: 110, gap: 4 },
  snowCardTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  snowCardValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  snowCardDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  daylightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daylightLabel: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  countdown: { color: colors.accent, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  clockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  clock: { width: '47%', minHeight: 48, gap: 2 },
  clockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clockValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  clockLabel: { color: colors.textSecondary, fontSize: 12 },
  roadButton: { flexDirection: 'row', gap: 10, backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 16 },
  roadText: { color: colors.background, fontSize: 16, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  checkRow: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  checkInner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { color: colors.text, fontSize: 18, flex: 1 },
  checkLabelDone: { color: colors.textSecondary },
  pressed: { opacity: 0.72 },
});