import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Mountain,
  Sun,
} from 'lucide-react-native';

import { WeatherIcon } from '../components/WeatherIcon';
import { WindCompass } from '../components/WindCompass';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import type { ElevationMode } from '../data/locations';
import {
  ROUTE_CATALOG,
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
} from '../data/routes';
import { useDualForecast } from '../hooks/useDualForecast';
import {
  avalancheDangerColor,
  fetchTromsoAvalanche,
  fetchWeatherAlerts,
  type AvalancheWarning,
  type WeatherAlertItem,
} from '../services/alertsService';
import type { HourlyForecastItem } from '../services/weatherService';
import { colors, sharedStyles, touchTarget } from '../theme';
import {
  calculateWindChill,
  estimateSnowlineMeters,
  exposureRisk,
  metersPerSecondToKmh,
  tromsoDaylight,
  windCardinal,
  windChillApplies,
} from '../utils/environmental';
import {
  formatClock,
  formatCountdown,
  formatTemperature,
  osloDateKey,
} from '../utils/format';

function getOsloMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}

function isForecastHourInTourWindow(
  isoTime: string,
  targetKey: string,
  startMinutes: number | null,
  endMinutes: number | null
): boolean {
  if (startMinutes === null || endMinutes === null) return false;
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return false;
  if (osloDateKey(d) !== targetKey) return false;
  const m = getOsloMinutesOfDay(d);
  return m + 59 >= startMinutes && m <= endMinutes;
}

export function WeatherScreen() {
  const { activeAssignment, activeRoute, selectedDate, selectManualRoute } = useActiveTour();
  const [elevation, setElevation] = useState<ElevationMode>('trailhead');
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number>(0);
  const [timeSelectionPinned, setTimeSelectionPinned] = useState<boolean>(false);
  const [now, setNow] = useState(() => new Date());
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertItem[]>([]);
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);

  const timelineScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CONFIG.weather.refreshIntervalMs);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTimeSelectionPinned(false);
    if (!activeRoute.summit) {
      setElevation('trailhead');
    }
  }, [activeRoute.id, activeRoute.summit, activeAssignment?.tourName]);

  useEffect(() => {
    let active = true;
    void fetchWeatherAlerts(activeRoute.weatherPoint, selectedDate).then((items) => {
      if (active) setWeatherAlerts(items);
    });
    if (activeRoute.category === 'hill_hike') {
      void fetchTromsoAvalanche(selectedDate).then((av) => {
        if (active) setAvalanche(av);
      });
    } else {
      setAvalanche(null);
    }
    return () => {
      active = false;
    };
  }, [activeRoute.weatherPoint, activeRoute.category, selectedDate]);

  const effectiveElevation: ElevationMode = activeRoute.summit ? elevation : 'trailhead';
  const dualForecast = useDualForecast(activeRoute.weatherPoint, activeRoute.summit);
  const bridgeForecast = useDualForecast(SANDNESSUNDBRUA_POINT, null);

  const activeForecast =
    effectiveElevation === 'summit' && dualForecast.top
      ? dualForecast.top
      : dualForecast.bottom;
  const hourlyList = activeForecast?.hourly ?? [];

  const targetDateKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => osloDateKey(now), [now]);
  const tourStartMinutes = activeAssignment?.startMinutes ?? null;
  const tourEndMinutes = activeAssignment?.endMinutes ?? null;

  // Auto-scroll timeline smoothly to tour start hour while keeping 'Now' at far-left
  useEffect(() => {
    if (timeSelectionPinned || hourlyList.length === 0) return;

    if (tourStartMinutes !== null && tourEndMinutes !== null) {
      const idx = hourlyList.findIndex((item) =>
        isForecastHourInTourWindow(item.time, targetDateKey, tourStartMinutes, tourEndMinutes)
      );
      if (idx !== -1) {
        setSelectedTimeIndex(idx);
        // Scroll horizontally (card width 82 + gap 8 = 90dp)
        const scrollX = Math.max(0, idx * 90 - 30);
        setTimeout(() => {
          timelineScrollRef.current?.scrollTo({ x: scrollX, animated: true });
        }, 150);
        return;
      }
    }

    setSelectedTimeIndex(0);
  }, [timeSelectionPinned, hourlyList, tourStartMinutes, tourEndMinutes, targetDateKey]);

  const clampedTimeIndex =
    hourlyList.length > 0 ? Math.min(selectedTimeIndex, hourlyList.length - 1) : 0;

  const activeConditions: HourlyForecastItem | null =
    hourlyList[clampedTimeIndex] ?? activeForecast?.current ?? null;

  const bottomHourItem: HourlyForecastItem | null =
    (activeConditions
      ? dualForecast.bottom?.hourly.find((h) => h.time === activeConditions.time)
      : undefined) ??
    dualForecast.bottom?.hourly[clampedTimeIndex] ??
    dualForecast.bottom?.current ??
    null;

  const summitHourItem: HourlyForecastItem | null =
    (activeConditions
      ? dualForecast.top?.hourly.find((h) => h.time === activeConditions.time)
      : undefined) ??
    dualForecast.top?.hourly[clampedTimeIndex] ??
    dualForecast.top?.current ??
    null;

  const bridgePeak = useMemo(() => {
    if (!activeRoute.usesBridgeWarning || !bridgeForecast.bottom?.hourly) return null;
    const winStart = tourStartMinutes !== null ? tourStartMinutes - 60 : 0;
    const winEnd = tourEndMinutes !== null ? tourEndMinutes + 60 : 24 * 60;
    let maxGust = 0;
    let maxTime = '';

    for (const item of bridgeForecast.bottom.hourly) {
      const d = new Date(item.time);
      if (Number.isNaN(d.getTime()) || osloDateKey(d) !== targetDateKey) continue;
      const m = getOsloMinutesOfDay(d);
      if (m < winStart || m > winEnd) continue;
      const g = item.windGustMs > 0 ? item.windGustMs : item.windSpeedMs;
      if (g > maxGust) {
        maxGust = g;
        maxTime = formatClock(d);
      }
    }

    return maxGust > 0 ? { maxGust, maxTime } : null;
  }, [
    activeRoute.usesBridgeWarning,
    bridgeForecast.bottom?.hourly,
    targetDateKey,
    tourStartMinutes,
    tourEndMinutes,
  ]);

  const bridgeAlert =
    bridgePeak !== null && bridgePeak.maxGust >= SANDNESSUNDBRUA_GUST_WARNING_MS;

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

  const daylight = useMemo(() => tromsoDaylight(selectedDate), [selectedDate]);

  const snowlineInfo = useMemo(() => {
    const tHead = bottomHourItem?.airTemperatureC ?? activeConditions?.airTemperatureC ?? 0;
    const tSummit = summitHourItem?.airTemperatureC ?? null;
    return estimateSnowlineMeters(
      activeRoute.trailhead.elevationMeters,
      tHead,
      activeRoute.summit?.elevationMeters ?? null,
      tSummit
    );
  }, [bottomHourItem, summitHourItem, activeConditions, activeRoute]);

  const freezingValueLabel = useMemo(() => {
    const tHead = bottomHourItem?.airTemperatureC ?? activeConditions?.airTemperatureC ?? 0;
    if (snowlineInfo.snowlineMeters !== null && snowlineInfo.snowlineMeters > 0) {
      return `~${snowlineInfo.snowlineMeters} m`;
    }
    if (snowlineInfo.snowlineMeters !== null && snowlineInfo.snowlineMeters <= 0) {
      return 'Below 0 m';
    }
    return tHead <= 0.5 ? 'Below 0 m' : 'Above summit';
  }, [snowlineInfo, bottomHourItem, activeConditions]);

  const activeTimeLabel = activeConditions
    ? new Date(activeConditions.time).toLocaleTimeString('en-GB', {
        timeZone: 'Europe/Oslo',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const avColors = avalanche ? avalancheDangerColor(avalanche.dangerLevel) : null;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      refreshControl={
        <RefreshControl
          refreshing={dualForecast.loading && dualForecast.bottom !== null}
          onRefresh={() => {
            dualForecast.reload();
            bridgeForecast.reload();
            void fetchWeatherAlerts(activeRoute.weatherPoint, selectedDate).then(setWeatherAlerts);
            if (activeRoute.category === 'hill_hike') {
              void fetchTromsoAvalanche(selectedDate).then(setAvalanche);
            }
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Location & Bridge Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {ROUTE_CATALOG.map((item) => {
          const selected = item.id === activeRoute.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                selectManualRoute(item.id);
                setTimeSelectionPinned(false);
              }}
              style={({ pressed }) => [
                touchTarget,
                styles.pill,
                selected && styles.pillSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {item.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 2. Active MET Weather Warnings */}
      {weatherAlerts.map((alert) => (
        <View key={alert.id} style={styles.metAlertCard}>
          <AlertTriangle color={colors.warning} size={18} />
          <View style={styles.alertCopy}>
            <Text style={styles.metAlertTitle}>
              {alert.event} ({alert.severity})
            </Text>
            {alert.validRangeLabel ? (
              <Text style={styles.alertRangeText}>{alert.validRangeLabel}</Text>
            ) : null}
            <Text style={styles.alertDetailText}>{alert.headline}</Text>
            {alert.instruction ? (
              <Text style={styles.metAlertInst}>{alert.instruction}</Text>
            ) : null}
          </View>
        </View>
      ))}

      {/* 3. Avalanche Forecast Card (Hill Hikes Only) */}
      {activeRoute.category === 'hill_hike' && avalanche && avColors ? (
        <View
          style={[
            styles.avalancheCard,
            { backgroundColor: avColors.bg, borderColor: avColors.color },
          ]}
        >
          <View style={styles.avalancheTop}>
            <Text style={[styles.avalancheLevel, { color: avColors.color }]}>
              VARSOM TROMSØ · AVALANCHE {avalanche.dangerLevel}/5
              {avalanche.dangerLevelName ? ` (${avalanche.dangerLevelName.toUpperCase()})` : ''}
            </Text>
            {avalanche.exposedHeight1 > 0 ? (
              <Text style={styles.avalancheHeight}>&gt;{avalanche.exposedHeight1}m</Text>
            ) : null}
          </View>
          {avalanche.problems.length > 0 ? (
            <Text style={styles.avalancheProblems}>
              Problems: {avalanche.problems.join(' · ')}
            </Text>
          ) : null}
          {avalanche.mainText ? (
            <Text style={styles.avalancheMain}>{avalanche.mainText}</Text>
          ) : null}
        </View>
      ) : null}

      {/* 4. Sandnessundbrua Gust Alert */}
      {bridgeAlert && bridgePeak ? (
        <Pressable
          onPress={() => {
            if (activeRoute.id !== 'sandnessundbrua') {
              selectManualRoute('sandnessundbrua');
              setTimeSelectionPinned(false);
            }
          }}
          style={({ pressed }) => [styles.bridgeAlert, pressed && styles.pressed]}
        >
          <AlertTriangle color={colors.danger} size={22} />
          <View style={styles.alertCopy}>
            <Text style={styles.bridgeTitle}>
              Sandnessundbrua Gusts {Math.round(bridgePeak.maxGust)} m/s ({bridgePeak.maxTime})
            </Text>
            <Text style={styles.bridgeDetail}>
              Exceeds {SANDNESSUNDBRUA_GUST_WARNING_MS} m/s threshold on Kvaløya Bridge.
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 5. Bottom vs Top Switcher (Hill Hikes) */}
      {activeRoute.summit ? (
        <View style={styles.dualRow}>
          <Pressable
            onPress={() => setElevation('trailhead')}
            style={[
              touchTarget,
              styles.dualCol,
              effectiveElevation === 'trailhead' && styles.dualColSelected,
            ]}
          >
            <Text style={styles.dualLabel}>
              BOTTOM ({activeRoute.trailhead.elevationMeters}m)
            </Text>
            <Text style={styles.dualTemp}>
              {bottomHourItem ? formatTemperature(bottomHourItem.airTemperatureC) : '—'}
            </Text>
            <Text style={styles.dualMeta}>
              {bottomHourItem ? `${bottomHourItem.windSpeedMs.toFixed(1)} m/s` : 'Loading'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setElevation('summit')}
            style={[
              touchTarget,
              styles.dualCol,
              effectiveElevation === 'summit' && styles.dualColSelected,
            ]}
          >
            <Text style={styles.dualLabel}>
              TOP ({activeRoute.summit.elevationMeters}m)
            </Text>
            <Text style={styles.dualTemp}>
              {summitHourItem ? formatTemperature(summitHourItem.airTemperatureC) : '—'}
            </Text>
            <Text style={styles.dualMeta}>
              {summitHourItem ? `${summitHourItem.windSpeedMs.toFixed(1)} m/s` : 'Loading'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* 6. Full 48h Scrollable Forecast */}
      {hourlyList.length > 0 ? (
        <View style={styles.timelineSection}>
          <View style={styles.timelineHeaderRow}>
            <Text style={styles.timelineHeader}>
              48H FORECAST ({activeTimeLabel || 'NOW'})
            </Text>
            {activeAssignment?.startTimeLabel ? (
              <Text style={styles.timelineTourTag}>
                TOUR: {activeAssignment.startTimeLabel}–{activeAssignment.endTimeLabel}
              </Text>
            ) : null}
          </View>
          <ScrollView
            ref={timelineScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineScroll}
          >
            {hourlyList.map((hourItem, idx) => {
              const isSelected = idx === clampedTimeIndex;
              const inTour = isForecastHourInTourWindow(
                hourItem.time,
                targetDateKey,
                tourStartMinutes,
                tourEndMinutes
              );
              const d = new Date(hourItem.time);
              const timeString =
                idx === 0
                  ? 'Now'
                  : d.toLocaleTimeString('en-GB', {
                      timeZone: 'Europe/Oslo',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
              const dayPrefix =
                osloDateKey(d) !== todayKey
                  ? d.toLocaleDateString('en-GB', {
                      timeZone: 'Europe/Oslo',
                      weekday: 'short',
                    })
                  : null;

              return (
                <Pressable
                  key={hourItem.time}
                  onPress={() => {
                    setSelectedTimeIndex(idx);
                    setTimeSelectionPinned(true);
                  }}
                  style={[
                    styles.hourCard,
                    inTour && styles.hourCardInTour,
                    isSelected && styles.hourCardSelected,
                  ]}
                >
                  {inTour ? <Text style={styles.hourTourBadge}>TOUR</Text> : null}
                  <Text style={[styles.hourTime, isSelected && styles.hourTimeSelected]}>
                    {dayPrefix ? `${dayPrefix} ${timeString}` : timeString}
                  </Text>
                  <WeatherIcon symbolCode={hourItem.symbolCode} size={26} />
                  <Text style={styles.hourTemp}>{Math.round(hourItem.airTemperatureC)}°</Text>
                  <Text style={styles.hourWind}>
                    {Math.round(hourItem.windSpeedMs)} m/s{' '}
                    {hourItem.windFromDirectionDeg !== null
                      ? windCardinal(hourItem.windFromDirectionDeg)
                      : ''}
                  </Text>
                  {hourItem.precipitationMm > 0 ? (
                    <Text style={styles.hourRainText}>
                      {hourItem.precipitationMm.toFixed(1)}mm
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {dualForecast.loading && !activeConditions ? (
        <View style={[sharedStyles.card, touchTarget, styles.loading]}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={sharedStyles.secondary}>Loading MET Norway forecast…</Text>
        </View>
      ) : null}

      {dualForecast.error && !activeConditions ? (
        <View style={sharedStyles.card}>
          <Text style={styles.errorText}>{dualForecast.error}</Text>
        </View>
      ) : null}

      {/* 7. Temperature & Felt Wind-Chill */}
      {activeConditions && felt !== null && exposure ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: exposure.backgroundColor, borderColor: exposure.color },
          ]}
        >
          <View style={styles.badgeTop}>
            <Text style={[styles.badgeTemp, { color: exposure.color }]}>
              {formatTemperature(activeConditions.airTemperatureC)}
            </Text>
            <View style={styles.badgeFeltCol}>
              <Text style={styles.badgeFeltLabel}>
                {chillApplies ? 'FELT WIND-CHILL' : 'AIR TEMP'} ·{' '}
                {effectiveElevation === 'summit' && activeRoute.summit
                  ? `${activeRoute.summit.elevationMeters}m`
                  : `${activeRoute.weatherPoint.elevationMeters}m`}
              </Text>
              <Text style={[styles.badgeFeltVal, { color: exposure.color }]}>
                {formatTemperature(felt)}
              </Text>
            </View>
          </View>
          <Text style={[styles.badgeLabel, { color: exposure.color }]}>{exposure.label}</Text>
          <Text style={styles.badgeDetail}>{exposure.detail}</Text>
        </View>
      ) : null}

      {/* 8. Side-by-Side Row: Wind Compass (Left) + Text-Only Daylight (Right) */}
      <View style={styles.splitRow}>
        <View style={styles.splitHalf}>
          {activeConditions ? (
            <WindCompass
              windFromDeg={activeConditions.windFromDirectionDeg}
              windSpeedMs={activeConditions.windSpeedMs}
              windGustMs={
                activeConditions.windGustMs > 0
                  ? activeConditions.windGustMs
                  : activeConditions.windSpeedMs * 1.35
              }
            />
          ) : null}
        </View>

        <View style={[sharedStyles.card, styles.splitHalf, styles.daylightCard]}>
          <View style={styles.daylightTop}>
            <Sun color={colors.accent} size={16} />
            <Text style={styles.daylightTitle} numberOfLines={1}>
              {daylight.label}
            </Text>
          </View>
          <Text style={styles.daylightCountdown}>
            {daylight.remainingMs !== null
              ? `${formatCountdown(daylight.remainingMs)} to ${daylight.countdownLabel.toLowerCase()}`
              : daylight.detail}
          </Text>

          <View style={styles.twilightRows}>
            <TwilightRow label="Dawn" value={formatClock(daylight.clocks.civilDawn)} />
            <TwilightRow label="Sunrise" value={formatClock(daylight.clocks.sunrise)} />
            <TwilightRow label="Sunset" value={formatClock(daylight.clocks.sunset)} />
            <TwilightRow label="Dusk" value={formatClock(daylight.clocks.civilDusk)} />
          </View>
        </View>
      </View>

      {/* 9. Real Freezing Elevation */}
      <View style={[sharedStyles.card, styles.freezingCard]}>
        <View style={styles.freezingLeft}>
          <Mountain color={colors.ice} size={22} />
          <View style={styles.freezingTextCol}>
            <Text style={styles.freezingLabel}>FREEZING ELEVATION (0°C)</Text>
            <Text style={styles.freezingDetail}>{snowlineInfo.label}</Text>
          </View>
        </View>
        <Text style={styles.freezingValue}>{freezingValueLabel}</Text>
      </View>
    </ScrollView>
  );
}

function TwilightRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.twilightRow}>
      <Text style={styles.twilightLabel}>{label}</Text>
      <Text style={styles.twilightValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg },
  pillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextSelected: { color: colors.accentSoft },
  metAlertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  alertCopy: { flex: 1, gap: 2 },
  metAlertTitle: { color: colors.warning, fontSize: 13, fontWeight: '800' },
  alertRangeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  alertDetailText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  metAlertInst: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  avalancheCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  avalancheTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avalancheLevel: { fontSize: 13, fontWeight: '900', flex: 1 },
  avalancheHeight: { color: colors.text, fontSize: 11, fontWeight: '800' },
  avalancheProblems: { color: colors.text, fontSize: 11, fontWeight: '700' },
  avalancheMain: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  bridgeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.dangerDarkBg,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  bridgeTitle: { color: '#FCA5A5', fontSize: 13, fontWeight: '800' },
  bridgeDetail: { color: colors.textSecondary, fontSize: 11 },
  dualRow: { flexDirection: 'row', gap: 8 },
  dualCol: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  dualColSelected: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg },
  dualLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  dualTemp: { color: colors.text, fontSize: 22, fontWeight: '800' },
  dualMeta: { color: colors.ice, fontSize: 12, fontWeight: '700' },
  timelineSection: { gap: 6 },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineHeader: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timelineTourTag: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  timelineScroll: { gap: 8, paddingVertical: 2 },
  hourCard: {
    minWidth: 80,
    minHeight: 106,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  hourCardInTour: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg },
  hourCardSelected: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg, borderWidth: 1.5 },
  hourTourBadge: { color: colors.accentSoft, fontSize: 9, fontWeight: '800' },
  hourTime: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  hourTimeSelected: { color: colors.accentSoft },
  hourTemp: { color: colors.text, fontSize: 17, fontWeight: '800' },
  hourWind: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  hourRainText: { color: colors.ice, fontSize: 10, fontWeight: '700' },
  loading: { gap: 10 },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  badge: { minHeight: 96, borderRadius: 14, borderWidth: 1.5, padding: 12, gap: 3 },
  badgeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeTemp: { fontSize: 32, fontWeight: '800' },
  badgeFeltCol: { alignItems: 'flex-end' },
  badgeFeltLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  badgeFeltVal: { fontSize: 22, fontWeight: '800' },
  badgeLabel: { fontSize: 16, fontWeight: '800' },
  badgeDetail: { color: colors.text, fontSize: 12 },
  splitRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  splitHalf: { flex: 1 },
  daylightCard: { padding: 10, justifyContent: 'space-between', gap: 4 },
  daylightTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  daylightTitle: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  daylightCountdown: { color: colors.accentSoft, fontSize: 10, fontWeight: '700' },
  twilightRows: { gap: 3, marginTop: 2 },
  twilightRow: { flexDirection: 'row', justifyContent: 'space-between' },
  twilightLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  twilightValue: { color: colors.text, fontSize: 12, fontWeight: '800' },
  freezingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 10,
  },
  freezingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  freezingTextCol: { flex: 1, gap: 1 },
  freezingLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  freezingDetail: { color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  freezingValue: { color: colors.ice, fontSize: 20, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});