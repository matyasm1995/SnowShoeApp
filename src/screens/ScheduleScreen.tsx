import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  MessageSquare,
  Palmtree,
  RefreshCw,
  Users,
  Wind,
  X,
} from 'lucide-react-native';

import { WeatherIcon } from '../components/WeatherIcon';
import { useActiveTour } from '../context/ActiveTourContext';
import {
  getRouteById,
  ROUTE_CATALOG,
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
  type ActivityRoute,
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
import { windCardinal } from '../utils/environmental';
import { formatClock, formatTemperature, osloDateKey } from '../utils/format';
import type { ScheduleStackParamList } from './TourOverviewScreen';

type NavProp = NativeStackNavigationProp<ScheduleStackParamList, 'ScheduleHome'>;

function getOsloMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

function summarizeWindow(
  hourly: HourlyForecastItem[] | undefined,
  dateKey: string,
  startMin: number | null,
  endMin: number | null
): {
  repHour: HourlyForecastItem | null;
  peakWindMs: number;
  peakGustMs: number;
  peakTime: string;
  dirDeg: number | null;
} {
  if (!hourly || hourly.length === 0) {
    return { repHour: null, peakWindMs: 0, peakGustMs: 0, peakTime: '', dirDeg: null };
  }

  const winStart = startMin !== null ? startMin - 30 : 0;
  const winEnd = endMin !== null ? endMin + 30 : 24 * 60;
  const mid = startMin !== null ? Math.round((startMin + (endMin ?? startMin + 180)) / 2) : null;

  let repHour: HourlyForecastItem | null = null;
  let bestMidDiff = Infinity;
  let peakWindMs = 0;
  let peakGustMs = 0;
  let peakTime = '';
  let dirDeg: number | null = null;

  for (const item of hourly) {
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime()) || osloDateKey(d) !== dateKey) continue;
    const m = getOsloMinutes(d);
    if (m < winStart || m > winEnd) continue;

    if (mid !== null) {
      const diff = Math.abs(m - mid);
      if (diff < bestMidDiff) {
        bestMidDiff = diff;
        repHour = item;
      }
    } else if (!repHour) {
      repHour = item;
    }

    const gust = item.windGustMs > 0 ? item.windGustMs : item.windSpeedMs;
    if (gust >= peakGustMs) {
      peakGustMs = gust;
      peakWindMs = item.windSpeedMs;
      peakTime = formatClock(d);
      dirDeg = item.windFromDirectionDeg;
    }
  }

  if (!repHour) {
    const first = hourly[0] ?? null;
    return {
      repHour: first,
      peakWindMs: first?.windSpeedMs ?? 0,
      peakGustMs: first ? (first.windGustMs > 0 ? first.windGustMs : first.windSpeedMs) : 0,
      peakTime: first ? formatClock(new Date(first.time)) : '',
      dirDeg: first?.windFromDirectionDeg ?? null,
    };
  }

  return { repHour, peakWindMs, peakGustMs, peakTime, dirDeg };
}

export function ScheduleScreen() {
  const navigation = useNavigation<NavProp>();
  const {
    profile,
    syncData,
    syncing,
    statusMsg,
    selectedDate,
    assignments,
    dutyStatus,
    upcomingDaysOff,
    managerNotes,
    submittedReports,
    closestAssignmentIdx,
    selectAssignment,
    selectManualRoute,
    shiftDate,
    resetToToday,
    syncNow,
    reloadProfileAndCache,
    dismissNote,
  } = useActiveTour();

  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertItem[]>([]);
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reloadProfileAndCache();
    }, [reloadProfileAndCache])
  );

  const closestAssignment =
    closestAssignmentIdx >= 0 ? assignments[closestAssignmentIdx] ?? null : null;
  const homeCategory = closestAssignment?.tourCategory ?? null;

  const tverrRoute = getRouteById('tverrfjellet');
  const rundRoute = getRouteById('rundfjellet');
  const coffeeRoute = getRouteById('coffee-malangen');
  const charlottenlundRoute = getRouteById('snowshoe-charlottenlund');

  const tverrForecast = useDualForecast(tverrRoute.weatherPoint, tverrRoute.summit);
  const rundForecast = useDualForecast(rundRoute.weatherPoint, rundRoute.summit);
  const coffeeForecast = useDualForecast(coffeeRoute.weatherPoint, null);
  const charlForecast = useDualForecast(charlottenlundRoute.weatherPoint, null);
  const bridgeForecast = useDualForecast(SANDNESSUNDBRUA_POINT, null);

  const alertPoint = useMemo(() => {
    if (homeCategory === 'hill_hike') return tverrRoute.weatherPoint;
    if (homeCategory === 'coffee_snowshoe') return coffeeRoute.weatherPoint;
    return charlottenlundRoute.weatherPoint;
  }, [homeCategory, tverrRoute.weatherPoint, coffeeRoute.weatherPoint, charlottenlundRoute.weatherPoint]);

  useEffect(() => {
    let active = true;
    void fetchWeatherAlerts(alertPoint).then((items) => {
      if (active) setWeatherAlerts(items);
    });
    if (homeCategory === 'hill_hike') {
      void fetchTromsoAvalanche(selectedDate).then((av) => {
        if (active) setAvalanche(av);
      });
    } else {
      setAvalanche(null);
    }
    return () => {
      active = false;
    };
  }, [alertPoint, homeCategory, selectedDate]);

  const dateKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => osloDateKey(new Date()), []);
  const isSelectedToday = dateKey === todayKey;
  const nowMinutes = getOsloMinutes(new Date());

  const pendingReportIndex = useMemo(() => {
    if (!isSelectedToday) return -1;
    return assignments.findIndex((tour, idx) => {
      const key = `${dateKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
      if (submittedReports[key]) return false;
      const end = tour.endMinutes ?? (tour.startMinutes !== null ? tour.startMinutes + 180 : null);
      return end !== null && nowMinutes >= end;
    });
  }, [isSelectedToday, assignments, dateKey, submittedReports, nowMinutes]);

  const startMin = closestAssignment?.startMinutes ?? (homeCategory === 'hill_hike' ? 570 : null);
  const endMin = closestAssignment?.endMinutes ?? (homeCategory === 'hill_hike' ? 870 : null);

  const tverrSummary = useMemo(
    () => summarizeWindow(tverrForecast.top?.hourly, dateKey, startMin, endMin),
    [tverrForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const rundSummary = useMemo(
    () => summarizeWindow(rundForecast.top?.hourly, dateKey, startMin, endMin),
    [rundForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const coffeeSummary = useMemo(
    () => summarizeWindow(coffeeForecast.bottom?.hourly, dateKey, startMin, endMin),
    [coffeeForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const charlSummary = useMemo(
    () => summarizeWindow(charlForecast.bottom?.hourly, dateKey, startMin, endMin),
    [charlForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgeSummary = useMemo(
    () =>
      summarizeWindow(
        bridgeForecast.bottom?.hourly,
        dateKey,
        startMin !== null ? startMin - 60 : null,
        endMin !== null ? endMin + 60 : null
      ),
    [bridgeForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgeAlert = bridgeSummary.peakGustMs >= SANDNESSUNDBRUA_GUST_WARNING_MS;

  const handleSync = async () => {
    try {
      await syncNow();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      Alert.alert('Sync Failed', msg);
    }
  };

  const openBridgeDetails = () => {
    selectManualRoute('sandnessundbrua');
    navigation.navigate('DetailedWeather');
  };

  const openTour = (idx: number) => {
    selectAssignment(idx);
    navigation.navigate('TourOverview');
  };

  const openManualRoute = (route: ActivityRoute) => {
    selectManualRoute(route.id);
    navigation.navigate('TourOverview');
  };

  const dateLabel = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const avColors = avalanche ? avalancheDangerColor(avalanche.dangerLevel) : null;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={() => void handleSync()}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Sync Header */}
      <View style={[sharedStyles.card, styles.syncCard]}>
        <View style={styles.syncLeft}>
          <Text style={styles.syncTitle}>
            {profile.fullName} ({profile.initials}) ·{' '}
            {profile.contractType === 'full-time' ? '100%' : 'Part-Time'}
          </Text>
          <Text style={styles.syncDetail} numberOfLines={1}>
            {statusMsg}
          </Text>
          {syncData ? (
            <Text style={styles.syncMeta}>
              Synced {new Date(syncData.syncedAt).toLocaleTimeString()} (
              {syncData.fromCache ? 'Offline Cache' : 'Live'})
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => void handleSync()}
          disabled={syncing}
          style={({ pressed }) => [touchTarget, styles.syncBtn, pressed && styles.pressed]}
        >
          {syncing ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <RefreshCw color={colors.background} size={22} />
          )}
        </Pressable>
      </View>

      {/* 2. Manager's Noticeboard */}
      {managerNotes.map((mn) => (
        <View
          key={mn.id}
          style={[
            styles.managerNoteCard,
            mn.level === 'critical' && styles.mnCritical,
            mn.level === 'warning' && styles.mnWarning,
            mn.level === 'info' && styles.mnInfo,
          ]}
        >
          <View style={styles.mnContent}>
            <Text
              style={[
                styles.mnTag,
                mn.level === 'critical' && { color: '#FCA5A5' },
                mn.level === 'warning' && { color: colors.warning },
                mn.level === 'info' && { color: colors.ice },
              ]}
            >
              MANAGER {mn.level.toUpperCase()} · {mn.dateLabel}
            </Text>
            <Text style={styles.mnText}>{mn.note}</Text>
          </View>
          {mn.level !== 'critical' ? (
            <Pressable
              onPress={() => void dismissNote(mn.id)}
              hitSlop={10}
              style={styles.mnDismiss}
            >
              <X color={colors.textSecondary} size={18} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {/* 3. Post-Trip Report Reminder */}
      {pendingReportIndex !== -1 ? (
        <Pressable
          onPress={() => openTour(pendingReportIndex)}
          style={({ pressed }) => [styles.reportReminder, pressed && styles.pressed]}
        >
          <ClipboardCheck color={colors.background} size={22} />
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Post-Trip Report Needed</Text>
            <Text style={styles.reminderSub}>
              {assignments[pendingReportIndex]?.tourName} finished — tap to submit report.
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 4. Date Bar */}
      <View style={styles.dateBar}>
        <Pressable
          onPress={() => shiftDate(-1)}
          style={({ pressed }) => [touchTarget, styles.dateNavBtn, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.text} size={24} />
        </Pressable>

        <Pressable onPress={resetToToday} style={styles.dateCenter}>
          <Text style={styles.dateLabelText}>{dateLabel}</Text>
          <Text style={[styles.todayBadge, isSelectedToday && styles.todayBadgeActive]}>
            {isSelectedToday ? 'TODAY' : 'TAP FOR TODAY'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => shiftDate(1)}
          style={({ pressed }) => [touchTarget, styles.dateNavBtn, pressed && styles.pressed]}
        >
          <ChevronRight color={colors.text} size={24} />
        </Pressable>
      </View>

      {/* 5. Duty Status & Next Days Off */}
      <View
        style={[
          styles.dutyCard,
          dutyStatus.type === 'day_off' && styles.dutyCardOff,
          dutyStatus.type === 'base' && styles.dutyCardBase,
          dutyStatus.type === 'tour' && styles.dutyCardTour,
        ]}
      >
        <View style={styles.dutyIconCol}>
          {dutyStatus.type === 'day_off' && <Palmtree color={colors.success} size={24} />}
          {dutyStatus.type === 'base' && <Briefcase color={colors.warning} size={24} />}
          {dutyStatus.type === 'tour' && <Calendar color={colors.accent} size={24} />}
        </View>
        <View style={styles.dutyTextCol}>
          <Text
            style={[
              styles.dutyTitle,
              dutyStatus.type === 'day_off' && { color: colors.success },
              dutyStatus.type === 'base' && { color: colors.warning },
              dutyStatus.type === 'tour' && { color: colors.accentSoft },
            ]}
          >
            {dutyStatus.title}
          </Text>
          <Text style={styles.dutyDetail}>{dutyStatus.detail}</Text>
          {upcomingDaysOff.length > 0 ? (
            <Text style={styles.nextOffText}>
              Next Days Off: {upcomingDaysOff.map((d) => d.dateLabel).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 6. Active MET Weather Warnings */}
      {weatherAlerts.length > 0 ? (
        <View style={styles.alertBanner}>
          <AlertTriangle color={colors.warning} size={20} />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>
              {weatherAlerts[0]?.event} ({weatherAlerts[0]?.severity})
            </Text>
            <Text style={styles.alertDetail} numberOfLines={2}>
              {weatherAlerts[0]?.headline}
            </Text>
          </View>
        </View>
      ) : null}

      {/* 7. Tour-Driven Home Weather Card */}
      {homeCategory === 'hill_hike' ? (
        <View style={[sharedStyles.card, styles.weatherCheckCard]}>
          <View style={styles.checkHeader}>
            <Wind color={colors.ice} size={18} />
            <Text style={styles.checkTitle}>HILL HIKE · SUMMIT WIND CHECK</Text>
            {avalanche && avColors ? (
              <View style={[styles.avBadge, { backgroundColor: avColors.bg, borderColor: avColors.color }]}>
                <Text style={[styles.avBadgeText, { color: avColors.color }]}>
                  AVALANCHE {avalanche.dangerLevel}/5
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.summitRow}>
            <View style={styles.summitBox}>
              <Text style={styles.summitName}>Tverrfjellet (524m)</Text>
              <Text style={styles.summitWind}>
                {tverrSummary.peakWindMs > 0
                  ? `${tverrSummary.peakWindMs.toFixed(1)} m/s ${
                      tverrSummary.dirDeg !== null ? windCardinal(tverrSummary.dirDeg) : ''
                    }`
                  : '—'}
              </Text>
              <Text style={styles.summitGust}>
                Gust {Math.round(tverrSummary.peakGustMs)} m/s ·{' '}
                {tverrSummary.repHour ? formatTemperature(tverrSummary.repHour.airTemperatureC) : '—'}
              </Text>
            </View>

            <View style={styles.summitBox}>
              <Text style={styles.summitName}>Rundfjellet (472m)</Text>
              <Text style={styles.summitWind}>
                {rundSummary.peakWindMs > 0
                  ? `${rundSummary.peakWindMs.toFixed(1)} m/s ${
                      rundSummary.dirDeg !== null ? windCardinal(rundSummary.dirDeg) : ''
                    }`
                  : '—'}
              </Text>
              <Text style={styles.summitGust}>
                Gust {Math.round(rundSummary.peakGustMs)} m/s ·{' '}
                {rundSummary.repHour ? formatTemperature(rundSummary.repHour.airTemperatureC) : '—'}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={openBridgeDetails}
            style={({ pressed }) => [
              styles.bridgeStrip,
              bridgeAlert && styles.bridgeStripDanger,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.bridgeText, bridgeAlert && { color: '#FCA5A5' }]}>
              {bridgeAlert
                ? `⚠️ Sandnessundbrua gusts ${Math.round(bridgeSummary.peakGustMs)} m/s (${bridgeSummary.peakTime}) — Tap for details`
                : `Sandnessundbrua: max gust ${Math.round(bridgeSummary.peakGustMs)} m/s — Tap for details`}
            </Text>
          </Pressable>
        </View>
      ) : homeCategory === 'coffee_snowshoe' ? (
        <View style={[sharedStyles.card, styles.weatherCheckCard]}>
          <View style={styles.checkHeader}>
            <WeatherIcon symbolCode={coffeeSummary.repHour?.symbolCode ?? null} size={22} />
            <Text style={styles.checkTitle}>MALANGEN · TOVE’S TRADISJONSMAT</Text>
          </View>
          <View style={styles.singleSummaryRow}>
            <Text style={styles.singleSummaryTemp}>
              {coffeeSummary.repHour ? formatTemperature(coffeeSummary.repHour.airTemperatureC) : '—'}
            </Text>
            <Text style={styles.singleSummaryWind}>
              Wind {coffeeSummary.peakWindMs.toFixed(1)} m/s{' '}
              {coffeeSummary.dirDeg !== null ? windCardinal(coffeeSummary.dirDeg) : ''} · Gust{' '}
              {Math.round(coffeeSummary.peakGustMs)} m/s
            </Text>
          </View>

          <Pressable
            onPress={openBridgeDetails}
            style={({ pressed }) => [
              styles.bridgeStrip,
              bridgeAlert && styles.bridgeStripDanger,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.bridgeText, bridgeAlert && { color: '#FCA5A5' }]}>
              {bridgeAlert
                ? `⚠️ Sandnessundbrua gusts ${Math.round(bridgeSummary.peakGustMs)} m/s (${bridgeSummary.peakTime}) — Tap for details`
                : `Sandnessundbrua: max gust ${Math.round(bridgeSummary.peakGustMs)} m/s — Tap for details`}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={[sharedStyles.card, styles.weatherCheckCard]}>
          <View style={styles.checkHeader}>
            <WeatherIcon symbolCode={charlSummary.repHour?.symbolCode ?? null} size={22} />
            <Text style={styles.checkTitle}>CHARLOTTENLUND · TRAIL WEATHER</Text>
          </View>
          <View style={styles.singleSummaryRow}>
            <Text style={styles.singleSummaryTemp}>
              {charlSummary.repHour ? formatTemperature(charlSummary.repHour.airTemperatureC) : '—'}
            </Text>
            <Text style={styles.singleSummaryWind}>
              Wind {charlSummary.peakWindMs.toFixed(1)} m/s{' '}
              {charlSummary.dirDeg !== null ? windCardinal(charlSummary.dirDeg) : ''} · Gust{' '}
              {Math.round(charlSummary.peakGustMs)} m/s
            </Text>
          </View>
        </View>
      )}

      {/* 8. Assigned Tours List */}
      {assignments.length > 0 ? (
        <Text style={sharedStyles.sectionTitle}>Your Tours ({assignments.length})</Text>
      ) : null}

      {assignments.map((tour, idx) => {
        const transport =
          [tour.vehicle, tour.shipName].filter(Boolean).join(' · ') || 'Transport TBD';
        const key = `${dateKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
        const report = submittedReports[key];
        const end = tour.endMinutes ?? (tour.startMinutes !== null ? tour.startMinutes + 180 : null);
        const reportNeeded = !report && isSelectedToday && end !== null && nowMinutes >= end;

        return (
          <Pressable
            key={`${tour.tourName}-${idx}`}
            onPress={() => openTour(idx)}
            style={({ pressed }) => [styles.tourCard, pressed && styles.pressed]}
          >
            <View style={styles.tourHeader}>
              <Text style={styles.tourTag}>
                {tour.isCharter ? 'CHARTER' : 'REGULAR TOUR'}
                {tour.startTimeLabel
                  ? ` · ${tour.startTimeLabel}${tour.endTimeLabel ? `–${tour.endTimeLabel}` : ''}`
                  : ''}
              </Text>
              <View style={styles.transportBadge}>
                <Text style={styles.transportText}>{transport}</Text>
              </View>
            </View>

            <Text style={styles.tourTitle}>{tour.tourName}</Text>

            <View style={styles.tourFooter}>
              <View style={styles.paxChip}>
                <Users color={colors.accent} size={15} />
                <Text style={styles.paxText}>
                  {tour.guestCount > 0 ? `${tour.guestCount} guests` : 'Open'}
                </Text>
              </View>

              {tour.commentsList.length > 0 || tour.cellNote ? (
                <View style={styles.paxChip}>
                  <MessageSquare color={colors.ice} size={15} />
                  <Text style={styles.noteIndicator}>Notes</Text>
                </View>
              ) : null}

              {report ? (
                <View style={styles.reportDoneBadge}>
                  <CheckCircle2 color={colors.success} size={13} />
                  <Text style={styles.reportDoneText}>Report Done</Text>
                </View>
              ) : reportNeeded ? (
                <View style={styles.reportNeededBadge}>
                  <Text style={styles.reportNeededText}>Report Needed</Text>
                </View>
              ) : null}

              <Text style={styles.openHint}>Briefing →</Text>
            </View>
          </Pressable>
        );
      })}

      {/* 9. Browse All Routes Fallback */}
      <Pressable
        onPress={() => setShowAllRoutes((v) => !v)}
        style={({ pressed }) => [touchTarget, styles.browseToggle, pressed && styles.pressed]}
      >
        <Text style={styles.browseToggleText}>Browse All Company Routes</Text>
        {showAllRoutes ? (
          <ChevronUp color={colors.textSecondary} size={20} />
        ) : (
          <ChevronDown color={colors.textSecondary} size={20} />
        )}
      </Pressable>

      {showAllRoutes ? (
        <View style={styles.routesList}>
          {ROUTE_CATALOG.map((route) => (
            <Pressable
              key={route.id}
              onPress={() => openManualRoute(route)}
              style={({ pressed }) => [styles.routeRow, pressed && styles.pressed]}
            >
              <View style={styles.routeLeft}>
                <Text style={styles.routeName}>{route.name}</Text>
                <Text style={styles.routeArea}>{route.area}</Text>
              </View>
              <ChevronRight color={colors.accent} size={20} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  syncLeft: { flex: 1, gap: 3 },
  syncTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  syncDetail: { color: colors.textSecondary, fontSize: 13 },
  syncMeta: { color: colors.accentSoft, fontSize: 12 },
  syncBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minWidth: 56,
    minHeight: 56,
  },
  managerNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    gap: 10,
  },
  mnCritical: { backgroundColor: '#450A0A', borderColor: colors.danger },
  mnWarning: { backgroundColor: '#451A03', borderColor: colors.warning },
  mnInfo: { backgroundColor: '#082F49', borderColor: colors.ice },
  mnContent: { flex: 1, gap: 3 },
  mnTag: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  mnText: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  mnDismiss: { padding: 4 },
  reportReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.warning,
    borderRadius: 14,
    padding: 12,
  },
  reminderCopy: { flex: 1, gap: 2 },
  reminderTitle: { color: colors.background, fontSize: 15, fontWeight: '900' },
  reminderSub: { color: colors.background, fontSize: 12, fontWeight: '700' },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  dateNavBtn: { width: 52, height: 52 },
  dateCenter: { alignItems: 'center', paddingVertical: 8 },
  dateLabelText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  todayBadge: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 2 },
  todayBadgeActive: { color: colors.accent },
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  dutyCardOff: { backgroundColor: '#064E3B', borderColor: colors.success },
  dutyCardBase: { backgroundColor: '#422006', borderColor: colors.warning },
  dutyCardTour: { backgroundColor: colors.accentDarkBg, borderColor: colors.accent },
  dutyIconCol: { justifyContent: 'center', alignItems: 'center' },
  dutyTextCol: { flex: 1, gap: 2 },
  dutyTitle: { fontSize: 16, fontWeight: '800' },
  dutyDetail: { color: colors.text, fontSize: 13 },
  nextOffText: { color: colors.success, fontSize: 12, fontWeight: '700', marginTop: 3 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#451A03',
    borderColor: colors.warning,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
  },
  alertCopy: { flex: 1, gap: 2 },
  alertTitle: { color: colors.warning, fontSize: 14, fontWeight: '800' },
  alertDetail: { color: colors.text, fontSize: 12 },
  weatherCheckCard: { gap: 10, padding: 14 },
  checkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  avBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  avBadgeText: { fontSize: 10, fontWeight: '800' },
  summitRow: { flexDirection: 'row', gap: 8 },
  summitBox: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  summitName: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  summitWind: { color: colors.text, fontSize: 17, fontWeight: '800' },
  summitGust: { color: colors.ice, fontSize: 12, fontWeight: '700' },
  singleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  singleSummaryTemp: { color: colors.text, fontSize: 26, fontWeight: '800' },
  singleSummaryWind: { color: colors.ice, fontSize: 14, fontWeight: '700' },
  bridgeStrip: {
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bridgeStripDanger: { backgroundColor: '#450A0A', borderColor: colors.danger },
  bridgeText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  tourCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  tourHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  tourTag: { color: colors.accentSoft, fontSize: 12, fontWeight: '800', flex: 1 },
  transportBadge: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  transportText: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  tourTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  tourFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  paxChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paxText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  noteIndicator: { color: colors.ice, fontSize: 12, fontWeight: '700' },
  reportDoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#064E3B',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportDoneText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  reportNeededBadge: {
    backgroundColor: '#451A03',
    borderColor: colors.warning,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportNeededText: { color: colors.warning, fontSize: 11, fontWeight: '800' },
  openHint: { color: colors.accent, fontSize: 14, fontWeight: '800', marginLeft: 'auto' },
  browseToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  browseToggleText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  routesList: { gap: 8 },
  routeRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  routeLeft: { flex: 1, gap: 2 },
  routeName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  routeArea: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.75 },
});