import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import {
  Check,
  Clock as ClockIcon,
  ExternalLink,
  Flag,
  MapPin,
  Mountain,
  Navigation,
  Play,
  RotateCcw,
  Snowflake,
  Square,
  Sun,
  Sunrise,
  Sunset,
} from 'lucide-react-native';

import { ElevationProfileGraph } from '../components/ElevationProfileGraph';
import { SunCurveGraph } from '../components/SunCurveGraph';
import { WeatherIcon } from '../components/WeatherIcon';
import { WindCompass } from '../components/WindCompass';
import { CONFIG } from '../config';
import { getChecklist } from '../data/checklists';
import { KATTFJORDEIDET_CAMERAS_URL, type ElevationMode } from '../data/locations';
import {
  getRouteById,
  matchRouteForText,
  ROUTE_CATALOG,
  type ActivityRoute,
} from '../data/routes';
import { useChecklist } from '../hooks/useChecklist';
import { useDualForecast } from '../hooks/useDualForecast';
import { useLocationPacing } from '../hooks/useLocationPacing';
import {
  getCachedSchedule,
  getGuideProfile,
  parseGuideAssignments,
  type GuideAssignment,
  type GuideProfile,
} from '../services/googleSheetsService';
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

function pickClosestAssignmentIndex(
  assignments: GuideAssignment[],
  now: Date
): number {
  if (assignments.length === 0) return -1;
  if (assignments.length === 1) return 0;

  const nowMin = getOsloMinutesOfDay(now);

  const activeIdx = assignments.findIndex((a) => {
    if (a.startMinutes === null) return false;
    const end = a.endMinutes ?? a.startMinutes + 180;
    return nowMin >= a.startMinutes - 30 && nowMin <= end;
  });
  if (activeIdx !== -1) return activeIdx;

  let bestUpcomingIdx = -1;
  let bestStart = Infinity;
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (!a) continue;
    const start = a.startMinutes ?? 600;
    const end = a.endMinutes ?? start + 180;
    if (end > nowMin && start < bestStart) {
      bestStart = start;
      bestUpcomingIdx = i;
    }
  }
  if (bestUpcomingIdx !== -1) return bestUpcomingIdx;

  return assignments.length - 1;
}

function isForecastHourInTourWindow(
  isoTime: string,
  todayKey: string,
  startMinutes: number | null,
  endMinutes: number | null
): boolean {
  if (startMinutes === null || endMinutes === null) return false;
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return false;
  if (osloDateKey(d) !== todayKey) return false;
  const m = getOsloMinutesOfDay(d);
  return m + 59 >= startMinutes && m <= endMinutes;
}

export function WeatherScreen() {
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [todayAssignments, setTodayAssignments] = useState<GuideAssignment[]>([]);
  const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState<number>(0);
  const [manualRouteId, setManualRouteId] = useState<string | null>(null);
  const [elevation, setElevation] = useState<ElevationMode>('trailhead');
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number>(0);
  const [timeSelectionPinned, setTimeSelectionPinned] = useState<boolean>(false);
  const [now, setNow] = useState(() => new Date());

  const loadScheduleContext = useCallback(async () => {
    const p = await getGuideProfile();
    setProfile(p);

    const cached = await getCachedSchedule();
    const currentNow = new Date();
    setNow(currentNow);

    if (cached) {
      const { assignments } = parseGuideAssignments(
        cached.values,
        cached.notes,
        cached.comments,
        p.initials,
        currentNow
      );
      setTodayAssignments(assignments);
      const closestIdx = pickClosestAssignmentIndex(assignments, currentNow);
      setSelectedAssignmentIdx(closestIdx >= 0 ? closestIdx : 0);
      setTimeSelectionPinned(false);
    } else {
      setTodayAssignments([]);
      setSelectedAssignmentIdx(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadScheduleContext();
    }, [loadScheduleContext])
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CONFIG.weather.refreshIntervalMs);
    return () => clearInterval(timer);
  }, []);

  const activeMission: GuideAssignment | null =
    todayAssignments[selectedAssignmentIdx] ?? null;

  const resolvedRoute: ActivityRoute = useMemo(() => {
    if (manualRouteId) {
      return getRouteById(manualRouteId);
    }
    if (activeMission) {
      const textBlob = [
        activeMission.tourName,
        activeMission.rawText,
        activeMission.cellNote ?? '',
        ...activeMission.commentsList.map((c) => c.content),
      ].join(' ');
      return matchRouteForText(
        activeMission.tourCategory,
        textBlob,
        profile?.defaultMountain ?? CONFIG.defaults.defaultMountain
      );
    }
    const defId =
      profile?.defaultMountain === 'rundfjellet' ? 'rundfjellet' : 'tverrfjellet';
    return getRouteById(defId);
  }, [manualRouteId, activeMission, profile?.defaultMountain]);

  const effectiveElevation: ElevationMode =
    resolvedRoute.summit ? elevation : 'trailhead';

  return (
    <WeatherBody
      route={resolvedRoute}
      elevation={effectiveElevation}
      now={now}
      todayAssignments={todayAssignments}
      selectedAssignmentIdx={selectedAssignmentIdx}
      activeMission={manualRouteId ? null : activeMission}
      isManualRoute={manualRouteId !== null}
      selectedTimeIndex={selectedTimeIndex}
      timeSelectionPinned={timeSelectionPinned}
      onSelectTimeIndex={(idx) => {
        setSelectedTimeIndex(idx);
        setTimeSelectionPinned(true);
      }}
      onAutoFocusTimeIndex={(idx) => setSelectedTimeIndex(idx)}
      onSelectAssignment={(idx) => {
        setManualRouteId(null);
        setSelectedAssignmentIdx(idx);
        setTimeSelectionPinned(false);
      }}
      onSelectManualRoute={(routeId) => {
        setManualRouteId(routeId);
        setTimeSelectionPinned(false);
        const nextRoute = getRouteById(routeId);
        if (!nextRoute.summit) setElevation('trailhead');
      }}
      onSelectElevation={setElevation}
    />
  );
}

function WeatherBody({
  route,
  elevation,
  now,
  todayAssignments,
  selectedAssignmentIdx,
  activeMission,
  isManualRoute,
  selectedTimeIndex,
  timeSelectionPinned,
  onSelectTimeIndex,
  onAutoFocusTimeIndex,
  onSelectAssignment,
  onSelectManualRoute,
  onSelectElevation,
}: {
  route: ActivityRoute;
  elevation: ElevationMode;
  now: Date;
  todayAssignments: GuideAssignment[];
  selectedAssignmentIdx: number;
  activeMission: GuideAssignment | null;
  isManualRoute: boolean;
  selectedTimeIndex: number;
  timeSelectionPinned: boolean;
  onSelectTimeIndex: (idx: number) => void;
  onAutoFocusTimeIndex: (idx: number) => void;
  onSelectAssignment: (idx: number) => void;
  onSelectManualRoute: (routeId: string) => void;
  onSelectElevation: (mode: ElevationMode) => void;
}) {
  const dualForecast = useDualForecast(route.weatherPoint, route.summit);
  const checklist = getChecklist(route.checklistId);
  const checks = useChecklist(route.checklistId);
  const daylight = useMemo(() => tromsoDaylight(now), [now]);
  const todayKey = useMemo(() => osloDateKey(now), [now]);

  const activeForecast =
    elevation === 'summit' && dualForecast.top ? dualForecast.top : dualForecast.bottom;
  const hourlyList = activeForecast?.hourly ?? [];

  const tourStartMinutes = activeMission?.startMinutes ?? null;
  const tourEndMinutes = activeMission?.endMinutes ?? null;

  useEffect(() => {
    if (timeSelectionPinned || hourlyList.length === 0) return;

    if (tourStartMinutes !== null && tourEndMinutes !== null) {
      const idx = hourlyList.findIndex((item) =>
        isForecastHourInTourWindow(item.time, todayKey, tourStartMinutes, tourEndMinutes)
      );
      if (idx !== -1) {
        onAutoFocusTimeIndex(idx);
        return;
      }
    }

    onAutoFocusTimeIndex(0);
  }, [
    timeSelectionPinned,
    hourlyList,
    tourStartMinutes,
    tourEndMinutes,
    todayKey,
    onAutoFocusTimeIndex,
  ]);

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

  const pacing = useLocationPacing(route, tourStartMinutes, now);

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

  const snowlineInfo = useMemo(() => {
    const tHead = bottomHourItem?.airTemperatureC ?? activeConditions?.airTemperatureC ?? 0;
    const tSummit = summitHourItem?.airTemperatureC ?? null;
    return estimateSnowlineMeters(
      route.trailhead.elevationMeters,
      tHead,
      route.summit?.elevationMeters ?? null,
      tSummit
    );
  }, [bottomHourItem, summitHourItem, activeConditions, route]);

  const activeTimeLabel = activeConditions
    ? new Date(activeConditions.time).toLocaleTimeString('en-GB', {
        timeZone: 'Europe/Oslo',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const concreteReturnTimeLabel = useMemo(() => {
    if (!activeMission || activeMission.endMinutes === null) return null;
    const margin =
      route.backAtParkingBeforeEndMinutes ??
      (route.driveMinutesEachWay > 0 ? route.driveMinutesEachWay : 0);
    if (margin <= 0) return null;
    const backMin = activeMission.endMinutes - margin;
    const h = Math.floor(backMin / 60) % 24;
    const m = backMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [activeMission, route]);

  const daylightWarning = useMemo(() => {
    if (tourEndMinutes === null) return null;
    if (daylight.clocks.civilDusk) {
      const duskMin = getOsloMinutesOfDay(daylight.clocks.civilDusk);
      if (tourEndMinutes > duskMin) {
        return `Civil dusk at ${formatClock(daylight.clocks.civilDusk)} (tour ends ${activeMission?.endTimeLabel ?? ''}). Pack headlamps!`;
      }
    }
    if (daylight.clocks.sunset) {
      const sunsetMin = getOsloMinutesOfDay(daylight.clocks.sunset);
      if (tourEndMinutes > sunsetMin) {
        return `Sunset at ${formatClock(daylight.clocks.sunset)} — final descent in twilight.`;
      }
    }
    return null;
  }, [tourEndMinutes, daylight.clocks, activeMission?.endTimeLabel]);

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      refreshControl={
        <RefreshControl
          refreshing={dualForecast.loading && dualForecast.bottom !== null}
          onRefresh={dualForecast.reload}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {todayAssignments.length > 0 ? (
        <View style={styles.missionSection}>
          {todayAssignments.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tourSwitcherScroll}
            >
              {todayAssignments.map((tour, idx) => {
                const isSelected = !isManualRoute && idx === selectedAssignmentIdx;
                const timeBadge = tour.startTimeLabel ?? `Tour ${idx + 1}`;
                return (
                  <Pressable
                    key={`${tour.tourName}-${idx}`}
                    onPress={() => onSelectAssignment(idx)}
                    style={[
                      styles.tourSwitchPill,
                      isSelected && styles.tourSwitchPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tourSwitchText,
                        isSelected && styles.tourSwitchTextSelected,
                      ]}
                    >
                      {timeBadge} · {tour.tourName.slice(0, 20)} ({tour.guestCount} pax)
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {activeMission ? (
            <View style={styles.missionBanner}>
              <View style={styles.missionHeader}>
                <Text style={styles.missionTag}>
                  {activeMission.isCharter ? 'CHARTER' : 'TODAY’S CLOSEST TOUR'} ·{' '}
                  {activeMission.guideCode}
                </Text>
                <View style={styles.badgeRow}>
                  {activeMission.shipName ? (
                    <View style={styles.vehicleBadge}>
                      <Text style={styles.vehicleText}>{activeMission.shipName}</Text>
                    </View>
                  ) : null}
                  {activeMission.vehicle ? (
                    <View style={styles.vehicleBadge}>
                      <Text style={styles.vehicleText}>{activeMission.vehicle}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <Text style={styles.missionTitle}>{activeMission.tourName}</Text>

              <View style={styles.missionMetaRow}>
                {activeMission.startTimeLabel ? (
                  <Text style={styles.missionTimeBadge}>
                    {activeMission.startTimeLabel}
                    {activeMission.endTimeLabel ? `–${activeMission.endTimeLabel}` : ''}
                  </Text>
                ) : null}
                <Text style={styles.missionPax}>
                  {activeMission.guestCount > 0
                    ? `${activeMission.guestCount} guests`
                    : 'Open bookings'}
                </Text>
              </View>

              {activeMission.cellNote ? (
                <Text style={styles.missionNote}>Note: {activeMission.cellNote}</Text>
              ) : null}
              {activeMission.commentsList.length > 0 ? (
                <Text style={styles.missionNote} numberOfLines={2}>
                  {activeMission.commentsList[0]?.author}:{' '}
                  {activeMission.commentsList[0]?.content}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {ROUTE_CATALOG.map((item) => {
          const selected = item.id === route.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelectManualRoute(item.id)}
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

      <View style={styles.sopCard}>
        <View style={styles.sopHeader}>
          <ClockIcon color={colors.accent} size={18} />
          <Text style={styles.sopTitle}>
            {route.area} · Return & Drive Plan
          </Text>
          {concreteReturnTimeLabel ? (
            <View style={styles.sopClockBadge}>
              <Text style={styles.sopClockText}>Back by {concreteReturnTimeLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.sopBody}>{route.returnNote}</Text>
      </View>

      {daylightWarning ? (
        <View style={styles.twilightWarning}>
          <Text style={styles.twilightWarningText}>{daylightWarning}</Text>
        </View>
      ) : null}

      {route.summit ? (
        <View style={styles.dualCard}>
          <View style={styles.dualRow}>
            <Pressable
              onPress={() => onSelectElevation('trailhead')}
              style={[
                touchTarget,
                styles.dualCol,
                elevation === 'trailhead' && styles.dualColSelected,
              ]}
            >
              <Text style={styles.dualLabel}>
                BOTTOM ({route.trailhead.elevationMeters}m)
              </Text>
              <Text style={styles.dualTemp}>
                {bottomHourItem ? formatTemperature(bottomHourItem.airTemperatureC) : '—'}
              </Text>
              <Text style={styles.dualMeta}>
                {bottomHourItem
                  ? `${bottomHourItem.windSpeedMs.toFixed(1)} m/s`
                  : 'Loading'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onSelectElevation('summit')}
              style={[
                touchTarget,
                styles.dualCol,
                elevation === 'summit' && styles.dualColSelected,
              ]}
            >
              <Text style={styles.dualLabel}>
                TOP ({route.summit.elevationMeters}m)
              </Text>
              <Text style={styles.dualTemp}>
                {summitHourItem ? formatTemperature(summitHourItem.airTemperatureC) : '—'}
              </Text>
              <Text style={styles.dualMeta}>
                {summitHourItem
                  ? `${summitHourItem.windSpeedMs.toFixed(1)} m/s`
                  : 'Loading'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {hourlyList.length > 0 ? (
        <View style={styles.timelineSection}>
          <View style={styles.timelineHeaderRow}>
            <Text style={styles.timelineHeader}>
              FORECAST TIMELINE ({activeTimeLabel || 'NOW'})
            </Text>
            {activeMission?.startTimeLabel ? (
              <Text style={styles.timelineTourTag}>
                TOUR: {activeMission.startTimeLabel}–{activeMission.endTimeLabel}
              </Text>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineScroll}
          >
            {hourlyList.map((hourItem, idx) => {
              const isSelected = idx === clampedTimeIndex;
              const inTour = isForecastHourInTourWindow(
                hourItem.time,
                todayKey,
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
                  onPress={() => onSelectTimeIndex(idx)}
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
                  <WeatherIcon symbolCode={hourItem.symbolCode} size={28} />
                  <Text style={styles.hourTemp}>{Math.round(hourItem.airTemperatureC)}°</Text>
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
                {elevation === 'summit' && route.summit
                  ? `${route.summit.elevationMeters}m`
                  : `${route.weatherPoint.elevationMeters}m`}
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

      {activeConditions ? (
        <WindCompass
          windFromDeg={activeConditions.windFromDirectionDeg}
          windSpeedMs={activeConditions.windSpeedMs}
          windGustMs={
            activeConditions.windGustMs > 0
              ? activeConditions.windGustMs
              : activeConditions.windSpeedMs * 1.35
          }
          ascentBearingDeg={route.ascentBearingDeg}
        />
      ) : null}

      {route.hasActiveTracking ? (
        <View style={[sharedStyles.card, styles.pacingCard]}>
          <View style={styles.pacingHeader}>
            <Navigation color={colors.accent} size={20} />
            <Text style={styles.pacingTitle}>GPS Elevation & Gate Pacing</Text>
            {pacing.gpsEnabled ? (
              <View style={styles.gpsLivePill}>
                <Text style={styles.gpsLiveText}>GPS LIVE</Text>
              </View>
            ) : null}
          </View>

          <ElevationProfileGraph
            route={route}
            currentDistanceKm={pacing.distanceAlongTrackKm}
            currentElevationM={pacing.effectiveAltitudeM}
            gpsActive={pacing.gpsEnabled}
          />

          <View style={styles.pacingControlsRow}>
            {!pacing.trailStartedAt ? (
              <Pressable
                onPress={pacing.startTrailNow}
                style={({ pressed }) => [
                  touchTarget,
                  styles.pacingBtnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Play color={colors.background} size={18} />
                <Text style={styles.pacingBtnPrimaryText}>Start Trail</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={pacing.resetTrail}
                style={({ pressed }) => [
                  touchTarget,
                  styles.pacingBtnSecondary,
                  pressed && styles.pressed,
                ]}
              >
                <RotateCcw color={colors.text} size={18} />
                <Text style={styles.pacingBtnSecondaryText}>
                  Started {formatClock(pacing.trailStartedAt)}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                if (pacing.gpsEnabled) {
                  pacing.disableGps();
                } else {
                  void pacing.enableGps();
                }
              }}
              style={({ pressed }) => [
                touchTarget,
                pacing.gpsEnabled ? styles.pacingBtnDanger : styles.pacingBtnSecondary,
                pressed && styles.pressed,
              ]}
            >
              {pacing.gpsEnabled ? (
                <>
                  <Square color={colors.text} size={16} />
                  <Text style={styles.pacingBtnSecondaryText}>Stop GPS</Text>
                </>
              ) : (
                <>
                  <MapPin color={colors.accent} size={18} />
                  <Text style={styles.pacingBtnSecondaryText}>Enable GPS</Text>
                </>
              )}
            </Pressable>
          </View>

          {pacing.gpsEnabled ? (
            <View style={styles.gpsStatsRow}>
              <View style={styles.gpsStatBox}>
                <Text style={styles.gpsStatLabel}>ALTITUDE</Text>
                <Text style={styles.gpsStatVal}>
                  {pacing.effectiveAltitudeM !== null
                    ? `${pacing.effectiveAltitudeM} m`
                    : '—'}
                </Text>
                <Text style={styles.gpsStatSub}>
                  {pacing.isCalibrated ? 'Calibrated' : 'Geoid est.'}
                </Text>
              </View>

              <View style={styles.gpsStatBox}>
                <Text style={styles.gpsStatLabel}>PROGRESS</Text>
                <Text style={styles.gpsStatVal}>
                  {pacing.distanceAlongTrackKm.toFixed(1)} km
                </Text>
                <Text style={styles.gpsStatSub}>
                  of {route.totalDistanceKm.toFixed(1)} km
                </Text>
              </View>

              <Pressable
                onPress={pacing.calibrateAtParking}
                disabled={pacing.rawAltitudeM === null}
                style={[styles.gpsStatBox, styles.calibrateBox]}
              >
                <Text style={styles.calibrateTitle}>ZERO AT CAR</Text>
                <Text style={styles.calibrateSub}>
                  Set to {route.trailhead.elevationMeters}m
                </Text>
              </Pressable>
            </View>
          ) : null}

          {pacing.gpsError ? (
            <Text style={styles.errorText}>{pacing.gpsError}</Text>
          ) : null}

          <View style={styles.gatesList}>
            {pacing.gates.map((ev) => {
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
                  onPress={() => pacing.toggleManualGate(ev.gate.id)}
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
                            ? '#EF4444'
                            : ev.status === 'reached'
                              ? '#4ADE80'
                              : colors.accent
                        }
                        size={16}
                      />
                      <Text style={styles.gateTitle}>{ev.gate.label}</Text>
                    </View>
                    <Text style={styles.gateDetail}>
                      +{Math.floor(ev.gate.offsetMinutes / 60)}h{' '}
                      {String(ev.gate.offsetMinutes % 60).padStart(2, '0')}m
                      {targetStr
                        ? ` (${pacing.isProjectedStart ? '~' : ''}${targetStr})`
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
                        ev.status === 'reached' && { color: '#4ADE80' },
                        ev.status === 'turnaround_now' && { color: '#FCA5A5' },
                        ev.status === 'late' && { color: '#FDE047' },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

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
            {activeConditions?.cloudCoverPct ?? 0}% Cloud cover
          </Text>
        </View>
      </View>

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
          <Clock
            label="Sunrise"
            value={formatClock(daylight.clocks.sunrise)}
            icon={<Sunrise color={colors.accent} size={16} />}
          />
          <Clock
            label="Sunset"
            value={formatClock(daylight.clocks.sunset)}
            icon={<Sunset color={colors.accent} size={16} />}
          />
          <Clock label="Civil dawn" value={formatClock(daylight.clocks.civilDawn)} />
          <Clock label="Civil dusk" value={formatClock(daylight.clocks.civilDusk)} />
        </View>
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(KATTFJORDEIDET_CAMERAS_URL)}
        style={({ pressed }) => [touchTarget, styles.roadButton, pressed && styles.pressed]}
      >
        <ExternalLink color={colors.background} size={22} />
        <Text style={styles.roadText}>Fv862 Kattfjordeidet — Road Cameras</Text>
      </Pressable>

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

function Clock({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
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
  missionSection: { gap: 8 },
  tourSwitcherScroll: { gap: 8, paddingVertical: 2 },
  tourSwitchPill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tourSwitchPillSelected: {
    borderColor: colors.accent,
    backgroundColor: '#0C4A6E',
  },
  tourSwitchText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  tourSwitchTextSelected: { color: colors.accent, fontWeight: '800' },
  missionBanner: {
    backgroundColor: '#0F172A',
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  missionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  missionTag: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    flex: 1,
  },
  badgeRow: { flexDirection: 'row', gap: 6 },
  vehicleBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vehicleText: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  missionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  missionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missionTimeBadge: {
    backgroundColor: '#082F49',
    color: '#7DD3FC',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  missionPax: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  missionNote: { color: '#7DD3FC', fontSize: 13, fontStyle: 'italic' },
  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  pill: {
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: { borderColor: colors.accent, backgroundColor: '#082F49' },
  pillText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  pillTextSelected: { color: colors.accent },
  sopCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  sopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sopTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  sopClockBadge: {
    backgroundColor: '#082F49',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sopClockText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  sopBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  twilightWarning: {
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  twilightWarningText: { color: '#FDE68A', fontSize: 13, fontWeight: '700' },
  dualCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 8,
  },
  dualRow: { flexDirection: 'row', gap: 8 },
  dualCol: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#09090B',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 2,
  },
  dualColSelected: {
    borderColor: colors.accent,
    backgroundColor: '#082F49',
  },
  dualLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  dualTemp: { color: colors.text, fontSize: 24, fontWeight: '800' },
  dualMeta: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  timelineSection: { gap: 8 },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timelineTourTag: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  timelineScroll: { gap: 10, paddingVertical: 4 },
  hourCard: {
    minWidth: 82,
    minHeight: 102,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  hourCardInTour: { borderColor: '#0284C7', backgroundColor: '#091E32' },
  hourCardSelected: { borderColor: colors.accent, backgroundColor: '#0C4A6E', borderWidth: 2 },
  hourTourBadge: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hourTime: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  hourTimeSelected: { color: colors.accent },
  hourTemp: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hourRainText: { color: '#38BDF8', fontSize: 11, fontWeight: '700' },
  loading: { gap: 12 },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  badge: { minHeight: 110, borderRadius: 16, borderWidth: 2, padding: 16, gap: 4 },
  badgeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeTemp: { fontSize: 38, fontWeight: '800' },
  badgeFeltCol: { alignItems: 'flex-end' },
  badgeFeltLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  badgeFeltVal: { fontSize: 26, fontWeight: '800' },
  badgeLabel: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  badgeDetail: { color: colors.text, fontSize: 14 },
  pacingCard: { gap: 12 },
  pacingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pacingTitle: { color: colors.text, fontSize: 17, fontWeight: '800', flex: 1 },
  gpsLivePill: {
    backgroundColor: '#064E3B',
    borderColor: '#4ADE80',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gpsLiveText: { color: '#4ADE80', fontSize: 10, fontWeight: '800' },
  pacingControlsRow: { flexDirection: 'row', gap: 8 },
  pacingBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  pacingBtnPrimaryText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  pacingBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  pacingBtnSecondaryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  pacingBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  gpsStatsRow: { flexDirection: 'row', gap: 8 },
  gpsStatBox: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsStatLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  gpsStatVal: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  gpsStatSub: { color: colors.textSecondary, fontSize: 10 },
  calibrateBox: { borderColor: colors.accent, backgroundColor: '#082F49' },
  calibrateTitle: { color: colors.accent, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  calibrateSub: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  gatesList: { gap: 8 },
  gateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  gateRowReached: { borderColor: '#4ADE80', backgroundColor: '#022C22' },
  gateRowTurnaround: { borderColor: '#EF4444', backgroundColor: '#450A0A' },
  gateRowLate: { borderColor: '#F59E0B', backgroundColor: '#451A03' },
  gateLeft: { flex: 1, gap: 2 },
  gateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gateTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  gateDetail: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  gateStatusPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gateStatusText: { color: '#38BDF8', fontSize: 11, fontWeight: '800' },
  snowRow: { flexDirection: 'row', gap: spacing.gap },
  snowCard: { flex: 1, minHeight: 110, gap: 4 },
  snowCardTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  snowCardValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  snowCardDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  daylightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daylightLabel: { color: colors.text, fontSize: 18, fontWeight: '700', flex: 1 },
  countdown: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  clockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  clock: { width: '47%', minHeight: 48, gap: 2 },
  clockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clockValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  clockLabel: { color: colors.textSecondary, fontSize: 12 },
  roadButton: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  roadText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
  },
  checkRow: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  checkInner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { color: colors.text, fontSize: 18, flex: 1 },
  checkLabelDone: { color: colors.textSecondary },
  pressed: { opacity: 0.72 },
});