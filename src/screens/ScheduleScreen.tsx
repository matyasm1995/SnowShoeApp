import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Bus,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  MessageSquare,
  Palmtree,
  RefreshCw,
  Ship,
  Users,
  Wind,
  X,
} from 'lucide-react-native';

import { ScheduleCalendarModal } from '../components/ScheduleCalendarModal';
import { TripReportModal } from '../components/TripReportModal';
import { WeatherAlertModal } from '../components/WeatherAlertModal';
import { WeatherIcon } from '../components/WeatherIcon';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useTracking } from '../context/TrackingContext';
import {
  applyPendingUpdate,
  subscribeUpdateReady,
} from '../services/appUpdateService';
import {
  getRouteById,
  ROUTE_CATALOG,
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
  type ActivityRoute,
} from '../data/routes';
import { routeIdToWeatherSpotId } from '../data/weatherSpots';
import { useDualForecast } from '../hooks/useDualForecast';
import {
  alertSeverityColors,
  avalancheDangerColor,
  fetchTromsoAvalanche,
  fetchWeatherAlerts,
  type AvalancheWarning,
  type WeatherAlertItem,
} from '../services/alertsService';
import {
  calculateDutyStatus,
  parseCompanyDayOperations,
  parseGuideAssignments,
  parseGuideDayNotes,
  type CompanyDayTour,
  type GuideAssignment,
  type TourColorStatus,
} from '../services/googleSheetsService';
import {
  summarizeForecastWindow,
  type ForecastWindowSummary,
} from '../services/weatherService';
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

function formatUnavailableWeather(summary: ForecastWindowSummary): string {
  switch (summary.unavailableReason) {
    case 'past':
      return 'Forecast unavailable (past date)';
    case 'beyond_range':
      return 'Forecast unavailable (>9 days out)';
    default:
      return 'Loading forecast…';
  }
}

function getStatusBadge(status: TourColorStatus): { label: string; color: string; bg: string } | null {
  switch (status) {
    case 'confirmed':
      return { label: 'CONFIRMED', color: colors.success, bg: colors.successDarkBg };
    case 'pending':
      return { label: 'BOOKED · UNCONFIRMED', color: colors.warning, bg: colors.warningDarkBg };
    case 'closed':
      return { label: 'CLOSED', color: colors.danger, bg: colors.dangerDarkBg };
    default:
      return null;
  }
}

export function ScheduleScreen() {
  const navigation = useNavigation<NavProp>();
  const {
    profile,
    syncData,
    syncing,
    selectedDate,
    assignments,
    dutyStatus,
    managerNotes,
    submittedReports,
    closestAssignmentIdx,
    activeRoute,
    selectAssignment,
    selectManualRoute,
    shiftDate,
    selectDate,
    resetToToday,
    syncNow,
    reloadProfileAndCache,
    dismissNote,
    refreshReports,
  } = useActiveTour();

  const { trackingActive } = useTracking();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => subscribeUpdateReady(setUpdateReady), []);

  const [viewMode, setViewMode] = useState<'mine' | 'all'>('mine');
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [showNextMonth, setShowNextMonth] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showGuideNotesModal, setShowGuideNotesModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<WeatherAlertItem | null>(null);
  const [inspectedCompanyTour, setInspectedCompanyTour] = useState<CompanyDayTour | null>(null);
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);

  const [directReport, setDirectReport] = useState<{
    tour: GuideAssignment;
    tourKey: string;
  } | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void reloadProfileAndCache();
      void fetchWeatherAlerts(alertPoint, selectedDate).then((items) => {
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
    }, [reloadProfileAndCache, alertPoint, homeCategory, selectedDate])
  );

  const dateKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);
  const todayKey = useMemo(() => osloDateKey(new Date()), []);
  const startMin = closestAssignment?.startMinutes ?? (homeCategory === 'hill_hike' ? 570 : null);
  const endMin = closestAssignment?.endMinutes ?? (homeCategory === 'hill_hike' ? 870 : null);

  const tverrSummary = useMemo(
    () => summarizeForecastWindow(tverrForecast.top?.hourly, dateKey, startMin, endMin),
    [tverrForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const rundSummary = useMemo(
    () => summarizeForecastWindow(rundForecast.top?.hourly, dateKey, startMin, endMin),
    [rundForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const coffeeSummary = useMemo(
    () => summarizeForecastWindow(coffeeForecast.bottom?.hourly, dateKey, startMin, endMin),
    [coffeeForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const charlSummary = useMemo(
    () => summarizeForecastWindow(charlForecast.bottom?.hourly, dateKey, startMin, endMin),
    [charlForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgeSummary = useMemo(
    () =>
      summarizeForecastWindow(
        bridgeForecast.bottom?.hourly,
        dateKey,
        startMin !== null ? Math.max(0, startMin - 60) : null,
        endMin !== null ? Math.min(24 * 60, endMin + 60) : null
      ),
    [bridgeForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgeAlert =
    bridgeSummary.hasData && bridgeSummary.peakGustMs >= SANDNESSUNDBRUA_GUST_WARNING_MS;

  const pendingReportData = useMemo(() => {
    const nowMin = getOsloMinutes(new Date());
    for (let idx = 0; idx < assignments.length; idx++) {
      const tour = assignments[idx];
      if (!tour) continue;
      if (tour.statusColor !== 'confirmed' && tour.statusColor !== 'pending') continue;

      const tourKey = `${dateKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
      if (submittedReports[tourKey]) continue;

      const ended =
        dateKey < todayKey ||
        (dateKey === todayKey && tour.endMinutes !== null && nowMin >= tour.endMinutes);

      if (ended) {
        return { tour, tourKey };
      }
    }
    return null;
  }, [assignments, submittedReports, dateKey, todayKey]);

  const upcoming30Days = useMemo(() => {
    if (!syncData) return [];
    const base = new Date();
    const list: {
      offset: number;
      dayLabel: string;
      statusText: string;
      kind: 'tour' | 'off' | 'base';
    }[] = [];

    for (let i = 0; i < 30; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const { assignments: dayTours, targetRowIdx } = parseGuideAssignments(
        syncData.values,
        syncData.notes,
        syncData.comments,
        syncData.backgrounds,
        syncData.fontLines,
        profile.initials,
        d
      );
      if (targetRowIdx === -1 && i > 0) break;

      const status = calculateDutyStatus(syncData.values, targetRowIdx, profile, dayTours.length);
      const label =
        i === 0
          ? 'Today'
          : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

      if (dayTours.length > 0) {
        const first = dayTours[0]!;
        const extra = dayTours.length > 1 ? ` +${dayTours.length - 1}` : '';
        const rcTag = status.alsoRentalCenter ? ' + RC' : '';
        list.push({
          offset: i,
          dayLabel: label,
          statusText: `${first.startTimeLabel ?? ''} ${first.tourName.slice(0, 20)}${extra}${rcTag}`.trim(),
          kind: 'tour',
        });
      } else if (status.type === 'day_off') {
        list.push({ offset: i, dayLabel: label, statusText: 'Day Off', kind: 'off' });
      } else {
        list.push({ offset: i, dayLabel: label, statusText: status.title, kind: 'base' });
      }
    }

    return list;
  }, [syncData, profile]);

  const companyOps = useMemo(() => {
    if (!syncData) {
      return { tours: [] as CompanyDayTour[], vehicles: [], rentalCenterRaw: '', guidesOnDutyRaw: '' };
    }
    return parseCompanyDayOperations(
      syncData.values,
      syncData.notes,
      syncData.comments,
      syncData.backgrounds,
      syncData.fontLines,
      profile.initials,
      selectedDate
    );
  }, [syncData, profile.initials, selectedDate]);

  const guideDayNotes = useMemo(() => {
    if (!syncData) return null;
    return parseGuideDayNotes(
      syncData.values,
      syncData.notes,
      syncData.comments,
      selectedDate
    );
  }, [syncData, selectedDate]);

  const companyTrips = useMemo(
    () => ROUTE_CATALOG.filter((r) => r.category !== 'bridge'),
    []
  );

  const highestNoteLevel = useMemo(() => {
    if (managerNotes.some((n) => n.level === 'critical')) return 'critical';
    if (managerNotes.some((n) => n.level === 'warning')) return 'warning';
    return 'info';
  }, [managerNotes]);

  const handleSync = async () => {
    try {
      await syncNow();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      Alert.alert('Sync Failed', msg);
    }
  };

  const openWeatherForSpot = (spotId: string) => {
    navigation.navigate('DetailedWeather', { spotId });
  };

  const openBridgeDetails = () => {
    navigation.navigate('DetailedWeather', { spotId: 'kvaloya-bridge' });
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
  const isToday = new Date().toDateString() === selectedDate.toDateString();
  const avColors = avalanche ? avalancheDangerColor(avalanche.dangerLevel) : null;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={() => void handleSync()}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Slim Sync & Profile Bar */}
      <View style={styles.slimSyncBar}>
        <View style={styles.slimSyncText}>
          <Text style={styles.syncName}>
            {profile.fullName || 'Guide'} ({profile.initials || 'Initials'})
          </Text>
          <Text style={styles.syncTime}>
            {syncData
              ? `Synced ${formatClock(new Date(syncData.syncedAt))} (${syncData.fromCache ? 'Cache' : 'Live'})`
              : 'Tap sync to load schedule'}
          </Text>
        </View>
        <Pressable
          onPress={() => void Linking.openURL(CONFIG.links.iticketPortal)}
          style={({ pressed }) => [styles.iticketSyncBtn, pressed && styles.pressed]}
        >
          <ExternalLink color={colors.ice} size={14} />
          <Text style={styles.iticketSyncText}>iTicket</Text>
        </Pressable>

        <Pressable
          onPress={() => void handleSync()}
          disabled={syncing}
          style={({ pressed }) => [styles.slimSyncBtn, pressed && styles.pressed]}
        >
          {syncing ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <RefreshCw color={colors.background} size={18} />
          )}
        </Pressable>
      </View>

      {/* 1b. OTA App Update Ready Banner (hidden during active GPS tracking) */}
      {updateReady && !trackingActive ? (
        <Pressable
          onPress={() => void applyPendingUpdate()}
          style={({ pressed }) => [styles.updateBanner, pressed && styles.pressed]}
        >
          <Download color={colors.background} size={18} />
          <Text style={styles.updateBannerText} numberOfLines={1}>
            App update ready — Tap to restart
          </Text>
          <Text style={styles.updateBannerAction}>Restart →</Text>
        </Pressable>
      ) : null}

      {/* 2. Date Navigation Bar */}
      <View style={styles.dateBar}>
        <Pressable
          onPress={() => shiftDate(-1)}
          style={({ pressed }) => [styles.dateNavBtn, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.text} size={22} />
        </Pressable>

        <Pressable
          onPress={() => setShowCalendarModal(true)}
          style={({ pressed }) => [styles.dateCenter, pressed && styles.pressed]}
        >
          <View style={styles.dateCenterRow}>
            <Calendar color={colors.accent} size={15} />
            <Text style={styles.dateLabelText}>{dateLabel}</Text>
          </View>
          <Text style={styles.datePickerHint}>TAP FOR CALENDAR</Text>
        </Pressable>

        {!isToday ? (
          <Pressable
            onPress={resetToToday}
            style={({ pressed }) => [styles.todayQuickBtn, pressed && styles.pressed]}
          >
            <Text style={styles.todayQuickText}>Today</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => shiftDate(1)}
          style={({ pressed }) => [styles.dateNavBtn, pressed && styles.pressed]}
        >
          <ChevronRight color={colors.text} size={22} />
        </Pressable>
      </View>

      {/* 2b. My Schedule / All Trips Segmented Toggle (My Schedule always first) */}
      <View style={styles.viewToggleRow}>
        <Pressable
          onPress={() => setViewMode('mine')}
          style={[
            styles.viewToggleBtn,
            viewMode === 'mine' && styles.viewToggleBtnActive,
          ]}
        >
          <Text
            style={[
              styles.viewToggleText,
              viewMode === 'mine' && styles.viewToggleTextActive,
            ]}
          >
            My Schedule{assignments.length > 0 ? ` (${assignments.length})` : ''}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode('all')}
          style={[
            styles.viewToggleBtn,
            viewMode === 'all' && styles.viewToggleBtnActive,
          ]}
        >
          <Text
            style={[
              styles.viewToggleText,
              viewMode === 'all' && styles.viewToggleTextActive,
            ]}
          >
            All Trips ({companyOps.tours.length})
          </Text>
        </Pressable>
      </View>

      {/* 2c. Daily Guide Notes from Column L (visible in both My Schedule & All Trips) */}
      {guideDayNotes ? (
        <Pressable
          onPress={() => setShowGuideNotesModal(true)}
          style={({ pressed }) => [styles.guideNotesCard, pressed && styles.pressed]}
        >
          <FileText color={colors.ice} size={18} />
          <View style={styles.guideNotesCopy}>
            <View style={styles.guideNotesTop}>
              <Text style={styles.guideNotesLabel}>GUIDE NOTES</Text>
              <Text style={styles.guideNotesHint}>Read →</Text>
            </View>
            <Text style={styles.guideNotesText} numberOfLines={3}>
              {guideDayNotes.text ||
                guideDayNotes.cellNote ||
                guideDayNotes.commentsList[0]?.content ||
                ''}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {viewMode === 'all' ? (
        <View style={styles.allTripsWrap}>
          {/* Vehicles Summary */}
          {companyOps.vehicles.length > 0 ? (
            <View style={[sharedStyles.card, styles.opsSummaryCard]}>
              <View style={styles.opsHeaderRow}>
                <Bus color={colors.accent} size={16} />
                <Text style={styles.opsHeaderTitle}>VEHICLES ASSIGNED ({dateLabel.toUpperCase()})</Text>
              </View>
              {companyOps.vehicles.map((v) => (
                <View key={v.vehicle} style={styles.vehicleSummaryRow}>
                  <Text style={styles.vehicleSummaryName}>{v.vehicle}</Text>
                  <Text style={styles.vehicleSummaryDetail}>{v.summary}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Rental Center & Guides on Duty */}
          {companyOps.rentalCenterRaw || companyOps.guidesOnDutyRaw ? (
            <View style={[sharedStyles.card, styles.opsSummaryCard]}>
              {companyOps.rentalCenterRaw ? (
                <View style={styles.vehicleSummaryRow}>
                  <Text style={styles.vehicleSummaryName}>Rental Center</Text>
                  <Text style={styles.vehicleSummaryDetail}>{companyOps.rentalCenterRaw}</Text>
                </View>
              ) : null}
              {companyOps.guidesOnDutyRaw ? (
                <View style={styles.vehicleSummaryRow}>
                  <Text style={styles.vehicleSummaryName}>Guides on Duty</Text>
                  <Text style={styles.vehicleSummaryDetail}>{companyOps.guidesOnDutyRaw}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={sharedStyles.sectionTitle}>
            All Company Trips ({companyOps.tours.length})
          </Text>

          {companyOps.tours.length === 0 ? (
            <View style={[sharedStyles.card, styles.emptyAllCard]}>
              <Text style={sharedStyles.secondary}>
                {syncData
                  ? 'No active company tours found in the sheet for this date.'
                  : 'Sync schedule to view all company trips.'}
              </Text>
            </View>
          ) : (
            companyOps.tours.map((ct) => {
              const statusBadge = getStatusBadge(ct.statusColor);
              return (
                <Pressable
                  key={ct.id}
                  onPress={() => setInspectedCompanyTour(ct)}
                  style={({ pressed }) => [
                    styles.tourCard,
                    ct.isMine && styles.tourCardMine,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.tourHeader}>
                    <Text style={styles.tourTag}>
                      {ct.isCharter ? 'CHARTER' : 'TOUR'}
                      {ct.startTimeLabel
                        ? ` · ${ct.startTimeLabel}${ct.endTimeLabel ? `–${ct.endTimeLabel}` : ''}`
                        : ''}
                    </Text>
                    <View style={styles.badgesRow}>
                      {ct.isMine ? (
                        <View style={styles.mineBadge}>
                          <Text style={styles.mineBadgeText}>YOUR TOUR</Text>
                        </View>
                      ) : null}
                      {statusBadge ? (
                        <View
                          style={[
                            styles.statusColorBadge,
                            { backgroundColor: statusBadge.bg, borderColor: statusBadge.color },
                          ]}
                        >
                          <Text style={[styles.statusColorText, { color: statusBadge.color }]}>
                            {statusBadge.label}
                          </Text>
                        </View>
                      ) : null}
                      {ct.shipName ? (
                        <View style={styles.shipBadge}>
                          <Ship color={colors.ice} size={12} />
                          <Text style={styles.shipText}>{ct.shipName}</Text>
                        </View>
                      ) : null}
                      {ct.vehicle ? (
                        <View style={styles.vehicleBadge}>
                          <Bus color={colors.accentSoft} size={12} />
                          <Text style={styles.vehicleText}>{ct.vehicle}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.tourTitle}>{ct.tourName}</Text>

                  <View style={styles.allGuidesRow}>
                    <Text style={styles.allGuidesLabel}>Guides:</Text>
                    {ct.assignedGuides.length > 0 ? (
                      ct.assignedGuides.map((g, gIdx) => (
                        <View
                          key={`${ct.id}-g-${gIdx}`}
                          style={[
                            styles.guidePill,
                            g.toLowerCase() === profile.initials.trim().toLowerCase() &&
                              styles.guidePillMine,
                          ]}
                        >
                          <Text
                            style={[
                              styles.guidePillText,
                              g.toLowerCase() === profile.initials.trim().toLowerCase() &&
                                styles.guidePillTextMine,
                            ]}
                          >
                            {g}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.allGuidesFallback} numberOfLines={1}>
                        {ct.rawText}
                      </Text>
                    )}
                  </View>

                  <View style={styles.tourFooter}>
                    <View style={styles.paxChip}>
                      <Users color={colors.accent} size={15} />
                      <Text style={styles.paxText}>
                        {ct.guestCount > 0 ? `${ct.guestCount} pax` : 'Open'}
                      </Text>
                    </View>
                    {ct.commentsList.length > 0 || ct.cellNote ? (
                      <MessageSquare color={colors.ice} size={15} />
                    ) : null}
                    <Text style={styles.openHint}>Details →</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      ) : (
        <>

      {/* 3. Clickable Manager Notices Bar */}
      {managerNotes.length > 0 ? (
        <Pressable
          onPress={() => setShowNotesModal(true)}
          style={({ pressed }) => [
            styles.noticePill,
            highestNoteLevel === 'critical' && styles.noticePillCritical,
            highestNoteLevel === 'warning' && styles.noticePillWarning,
            highestNoteLevel === 'info' && styles.noticePillInfo,
            pressed && styles.pressed,
          ]}
        >
          <Bell
            color={
              highestNoteLevel === 'critical'
                ? colors.danger
                : highestNoteLevel === 'warning'
                  ? colors.warning
                  : colors.ice
            }
            size={18}
          />
          <Text style={styles.noticePillText} numberOfLines={1}>
            {managerNotes.length} Manager {managerNotes.length === 1 ? 'Note' : 'Notes'}:{' '}
            {managerNotes[0]?.note}
          </Text>
          <Text style={styles.noticePillAction}>Read →</Text>
        </Pressable>
      ) : null}

      {/* 4. 1-Tap Post-Trip Report Reminder Banner */}
      {pendingReportData ? (
        <Pressable
          onPress={() => setDirectReport(pendingReportData)}
          style={({ pressed }) => [styles.reportReminder, pressed && styles.pressed]}
        >
          <ClipboardList color={colors.background} size={20} />
          <Text style={styles.reportReminderText} numberOfLines={1}>
            Report needed: {pendingReportData.tour.tourName}
          </Text>
          <Text style={styles.reportReminderAction}>Fill Report →</Text>
        </Pressable>
      ) : null}

      {/* 5. Duty Status Card on 0-tour days, or compact Rental Center notice when combined with a tour */}
      {assignments.length === 0 ? (
        <View
          style={[
            styles.dutyCard,
            dutyStatus.type === 'day_off' ? styles.dutyCardOff : styles.dutyCardBase,
          ]}
        >
          {dutyStatus.type === 'day_off' ? (
            <Palmtree color={colors.success} size={24} />
          ) : (
            <Briefcase color={colors.warning} size={24} />
          )}
          <View style={styles.dutyTextCol}>
            <Text
              style={[
                styles.dutyTitle,
                { color: dutyStatus.type === 'day_off' ? colors.success : colors.warning },
              ]}
            >
              {dutyStatus.title}
            </Text>
            {dutyStatus.type !== 'day_off' ? (
              <Text style={styles.dutyDetail}>{dutyStatus.detail}</Text>
            ) : null}
          </View>
        </View>
      ) : dutyStatus.alsoRentalCenter ? (
        <View style={[styles.dutyCard, styles.dutyCardBase]}>
          <Briefcase color={colors.warning} size={20} />
          <View style={styles.dutyTextCol}>
            <Text style={[styles.dutyTitle, { color: colors.warning }]}>
              Also Scheduled: Rental Center
            </Text>
            <Text style={styles.dutyDetail}>{dutyStatus.detail}</Text>
          </View>
        </View>
      ) : null}

      {/* 6. Active MET / Yr Weather Warnings (Clickable, filtered to selected date) */}
      {weatherAlerts.map((alert) => {
        const palette = alertSeverityColors(alert.riskColor);
        return (
          <Pressable
            key={alert.id}
            onPress={() => setSelectedAlert(alert)}
            style={({ pressed }) => [
              styles.alertBanner,
              { backgroundColor: palette.bg, borderColor: palette.color },
              pressed && styles.pressed,
            ]}
          >
            <AlertTriangle color={palette.color} size={18} />
            <View style={styles.alertCopy}>
              <View style={styles.alertTopRow}>
                <Text style={[styles.alertTitle, { color: palette.color }]} numberOfLines={1}>
                  {alert.event} ({alert.severity})
                </Text>
                <Text style={[styles.alertDetailsHint, { color: palette.color }]}>
                  Details →
                </Text>
              </View>
              {alert.validRangeLabel ? (
                <Text style={styles.alertRangeText}>{alert.validRangeLabel}</Text>
              ) : null}
              <Text style={styles.alertDetail} numberOfLines={2}>
                {alert.headline}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {/* 7. YOUR TOURS */}
      {assignments.length > 0 ? (
        <Text style={sharedStyles.sectionTitle}>Today's Tours ({assignments.length})</Text>
      ) : null}

      {assignments.map((tour, idx) => {
        const tourKey = `${dateKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
        const report = submittedReports[tourKey];
        const statusBadge = getStatusBadge(tour.statusColor);
        const ended =
          dateKey < todayKey ||
          (dateKey === todayKey &&
            tour.endMinutes !== null &&
            getOsloMinutes(new Date()) >= tour.endMinutes);

        const showReportNeeded =
          !report && ended && (tour.statusColor === 'confirmed' || tour.statusColor === 'pending');

        return (
          <Pressable
            key={`${tour.tourName}-${idx}`}
            onPress={() => openTour(idx)}
            style={({ pressed }) => [styles.tourCard, pressed && styles.pressed]}
          >
            <View style={styles.tourHeader}>
              <Text style={styles.tourTag}>
                {tour.isCharter ? 'CHARTER' : 'TOUR'}
                {tour.startTimeLabel
                  ? ` · ${tour.startTimeLabel}${tour.endTimeLabel ? `–${tour.endTimeLabel}` : ''}`
                  : ''}
              </Text>
              <View style={styles.badgesRow}>
                {statusBadge ? (
                  <View
                    style={[
                      styles.statusColorBadge,
                      { backgroundColor: statusBadge.bg, borderColor: statusBadge.color },
                    ]}
                  >
                    <Text style={[styles.statusColorText, { color: statusBadge.color }]}>
                      {statusBadge.label}
                    </Text>
                  </View>
                ) : null}
                {tour.shipName ? (
                  <View style={styles.shipBadge}>
                    <Ship color={colors.ice} size={12} />
                    <Text style={styles.shipText}>{tour.shipName}</Text>
                  </View>
                ) : null}
                {tour.vehicle ? (
                  <View style={styles.vehicleBadge}>
                    <Bus color={colors.accentSoft} size={12} />
                    <Text style={styles.vehicleText}>{tour.vehicle}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Text style={styles.tourTitle}>{tour.tourName}</Text>

            <View style={styles.tourFooter}>
              <View style={styles.paxChip}>
                <Users color={colors.accent} size={15} />
                <Text style={styles.paxText}>
                  {tour.guestCount > 0 ? `${tour.guestCount} pax` : 'Open'}
                </Text>
              </View>

              {report ? (
                <View style={styles.reportDoneChip}>
                  <CheckCircle2 color={colors.success} size={13} />
                  <Text style={styles.reportDoneText}>Report Done</Text>
                </View>
              ) : showReportNeeded ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setDirectReport({ tour, tourKey });
                  }}
                  style={styles.reportNeededChip}
                >
                  <Text style={styles.reportNeededText}>Report Needed</Text>
                </Pressable>
              ) : null}

              {tour.commentsList.length > 0 || tour.cellNote ? (
                <MessageSquare color={colors.ice} size={15} />
              ) : null}

              <Text style={styles.openHint}>Briefing →</Text>
            </View>
          </Pressable>
        );
      })}

      {/* 8. Tour-Driven Weather Card (Clickable to DetailedWeather) */}
      <Text style={sharedStyles.sectionTitle}>Weather Conditions</Text>
      {homeCategory === 'hill_hike' ? (
        <View style={[sharedStyles.card, styles.weatherCheckCard]}>
          <Pressable
            onPress={() => openWeatherForSpot(routeIdToWeatherSpotId(activeRoute.id))}
            style={({ pressed }) => [styles.checkHeader, pressed && styles.pressed]}
          >
            <Wind color={colors.ice} size={18} />
            <View style={styles.checkTitleCol}>
              <Text style={styles.checkTitle}>HILL HIKE · SUMMIT WIND CHECK</Text>
              {tverrSummary.windowLabel ? (
                <Text style={styles.checkWindowLabel}>{tverrSummary.windowLabel}</Text>
              ) : null}
            </View>
            {avalanche && avColors ? (
              <View
                style={[
                  styles.avBadge,
                  { backgroundColor: avColors.bg, borderColor: avColors.color },
                ]}
              >
                <Text style={[styles.avBadgeText, { color: avColors.color }]}>
                  AVALANCHE {avalanche.dangerLevel}/5
                </Text>
              </View>
            ) : (
              <Text style={styles.weatherLinkHint}>Forecast →</Text>
            )}
          </Pressable>

          {!tverrSummary.hasData && !rundSummary.hasData ? (
            <Text style={styles.weatherUnavailableText}>
              {formatUnavailableWeather(tverrSummary)}
            </Text>
          ) : (
            <View style={styles.summitRow}>
              <Pressable
                onPress={() => openWeatherForSpot('tverrfjellet')}
                style={({ pressed }) => [styles.summitBox, pressed && styles.pressed]}
              >
                <Text style={styles.summitName}>Tverrfjellet (524m) →</Text>
                <Text style={styles.summitWind}>
                  {tverrSummary.hasData
                    ? `Max ${tverrSummary.peakWindMs.toFixed(1)} m/s${
                        tverrSummary.dirDeg !== null ? ` ${windCardinal(tverrSummary.dirDeg)}` : ''
                      }`
                    : '—'}
                </Text>
                <Text style={styles.summitGust}>
                  {tverrSummary.hasData
                    ? `Gust ${Math.round(tverrSummary.peakGustMs)} m/s · ${
                        tverrSummary.repHour
                          ? formatTemperature(tverrSummary.repHour.airTemperatureC)
                          : '—'
                      }`
                    : formatUnavailableWeather(tverrSummary)}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => openWeatherForSpot('rundfjellet')}
                style={({ pressed }) => [styles.summitBox, pressed && styles.pressed]}
              >
                <Text style={styles.summitName}>Rundfjellet (472m) →</Text>
                <Text style={styles.summitWind}>
                  {rundSummary.hasData
                    ? `Max ${rundSummary.peakWindMs.toFixed(1)} m/s${
                        rundSummary.dirDeg !== null ? ` ${windCardinal(rundSummary.dirDeg)}` : ''
                      }`
                    : '—'}
                </Text>
                <Text style={styles.summitGust}>
                  {rundSummary.hasData
                    ? `Gust ${Math.round(rundSummary.peakGustMs)} m/s · ${
                        rundSummary.repHour
                          ? formatTemperature(rundSummary.repHour.airTemperatureC)
                          : '—'
                      }`
                    : formatUnavailableWeather(rundSummary)}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={openBridgeDetails}
            style={({ pressed }) => [
              styles.bridgeStrip,
              bridgeAlert && styles.bridgeStripDanger,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.bridgeText, bridgeAlert && { color: '#FCA5A5' }]}>
              {!bridgeSummary.hasData
                ? `Sandnessundbrua: ${formatUnavailableWeather(bridgeSummary)}`
                : bridgeAlert
                  ? `⚠️ Sandnessundbrua gusts ${Math.round(bridgeSummary.peakGustMs)} m/s (${bridgeSummary.peakTime}) — Tap for details`
                  : `Sandnessundbrua: max gust ${Math.round(bridgeSummary.peakGustMs)} m/s — Tap for details`}
            </Text>
          </Pressable>
        </View>
      ) : homeCategory === 'coffee_snowshoe' ? (
        <View style={[sharedStyles.card, styles.weatherCheckCard]}>
          <Pressable
            onPress={() => openWeatherForSpot('coffee-hike')}
            style={({ pressed }) => [styles.weatherTapArea, pressed && styles.pressed]}
          >
            <View style={styles.checkHeader}>
              <WeatherIcon symbolCode={coffeeSummary.repHour?.symbolCode ?? null} size={22} />
              <View style={styles.checkTitleCol}>
                <Text style={styles.checkTitle}>COFFEE HIKE · MALANGEN</Text>
                {coffeeSummary.windowLabel ? (
                  <Text style={styles.checkWindowLabel}>{coffeeSummary.windowLabel}</Text>
                ) : null}
              </View>
              <Text style={styles.weatherLinkHint}>Forecast →</Text>
            </View>
            {coffeeSummary.hasData ? (
              <View style={styles.singleSummaryRow}>
                <Text style={styles.singleSummaryTemp}>
                  {coffeeSummary.repHour
                    ? formatTemperature(coffeeSummary.repHour.airTemperatureC)
                    : '—'}
                </Text>
                <Text style={styles.singleSummaryWind}>
                  Max wind {coffeeSummary.peakWindMs.toFixed(1)} m/s{' '}
                  {coffeeSummary.dirDeg !== null ? windCardinal(coffeeSummary.dirDeg) : ''} · Gust{' '}
                  {Math.round(coffeeSummary.peakGustMs)} m/s
                </Text>
              </View>
            ) : (
              <Text style={styles.weatherUnavailableText}>
                {formatUnavailableWeather(coffeeSummary)}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={openBridgeDetails}
            style={({ pressed }) => [
              styles.bridgeStrip,
              bridgeAlert && styles.bridgeStripDanger,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.bridgeText, bridgeAlert && { color: '#FCA5A5' }]}>
              {!bridgeSummary.hasData
                ? `Sandnessundbrua: ${formatUnavailableWeather(bridgeSummary)}`
                : bridgeAlert
                  ? `⚠️ Sandnessundbrua gusts ${Math.round(bridgeSummary.peakGustMs)} m/s (${bridgeSummary.peakTime}) — Tap for details`
                  : `Sandnessundbrua: max gust ${Math.round(bridgeSummary.peakGustMs)} m/s — Tap for details`}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => openWeatherForSpot('charlottenlund')}
          style={({ pressed }) => [
            sharedStyles.card,
            styles.weatherCheckCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.checkHeader}>
            <WeatherIcon symbolCode={charlSummary.repHour?.symbolCode ?? null} size={22} />
            <View style={styles.checkTitleCol}>
              <Text style={styles.checkTitle}>CHARLOTTENLUND · TRAIL WEATHER</Text>
              {charlSummary.windowLabel ? (
                <Text style={styles.checkWindowLabel}>{charlSummary.windowLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.weatherLinkHint}>Forecast →</Text>
          </View>
          {charlSummary.hasData ? (
            <View style={styles.singleSummaryRow}>
              <Text style={styles.singleSummaryTemp}>
                {charlSummary.repHour
                  ? formatTemperature(charlSummary.repHour.airTemperatureC)
                  : '—'}
              </Text>
              <Text style={styles.singleSummaryWind}>
                Max wind {charlSummary.peakWindMs.toFixed(1)} m/s{' '}
                {charlSummary.dirDeg !== null ? windCardinal(charlSummary.dirDeg) : ''} · Gust{' '}
                {Math.round(charlSummary.peakGustMs)} m/s
              </Text>
            </View>
          ) : (
            <Text style={styles.weatherUnavailableText}>
              {formatUnavailableWeather(charlSummary)}
            </Text>
          )}
        </Pressable>
      )}

      {/* 9. Scrollable Multi-Week Schedule Overview */}
      <Text style={sharedStyles.sectionTitle}>Overview</Text>
      {upcoming30Days.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowNextMonth((v) => !v)}
            style={({ pressed }) => [touchTarget, styles.browseToggle, pressed && styles.pressed]}
          >
            <Text style={styles.browseToggleText}>
              Upcoming Schedule ({upcoming30Days.length} Days)
            </Text>
            {showNextMonth ? (
              <ChevronUp color={colors.textSecondary} size={20} />
            ) : (
              <ChevronDown color={colors.textSecondary} size={20} />
            )}
          </Pressable>

          {showNextMonth ? (
            <View style={styles.weekCard}>
              <ScrollView
                style={styles.weekScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {upcoming30Days.map((item) => (
                  <Pressable
                    key={item.dayLabel}
                    onPress={() => {
                      resetToToday();
                      if (item.offset > 0) shiftDate(item.offset);
                    }}
                    style={styles.weekRow}
                  >
                    <Text style={styles.weekDay}>{item.dayLabel}</Text>
                    <Text
                      style={[
                        styles.weekStatus,
                        item.kind === 'off' && { color: colors.success },
                        item.kind === 'tour' && { color: colors.accentSoft, fontWeight: '800' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.statusText}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : null}

      {/* 10. Browse All Company Trips */}
      <Pressable
        onPress={() => setShowAllRoutes((v) => !v)}
        style={({ pressed }) => [touchTarget, styles.browseToggle, pressed && styles.pressed]}
      >
        <Text style={styles.browseToggleText}>Browse All Company Trips</Text>
        {showAllRoutes ? (
          <ChevronUp color={colors.textSecondary} size={20} />
        ) : (
          <ChevronDown color={colors.textSecondary} size={20} />
        )}
      </Pressable>

      {showAllRoutes ? (
        <View style={styles.routesList}>
          {companyTrips.map((route) => (
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
        </>
      )}

      {/* Manager Noticeboard Full-Text Modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manager Noticeboard</Text>
              <Pressable onPress={() => setShowNotesModal(false)} style={styles.modalClose}>
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {managerNotes.length === 0 ? (
                <Text style={sharedStyles.secondary}>All notices dismissed.</Text>
              ) : (
                managerNotes.map((mn) => (
                  <View
                    key={mn.id}
                    style={[
                      styles.modalNoteCard,
                      mn.level === 'critical' && styles.noticePillCritical,
                      mn.level === 'warning' && styles.noticePillWarning,
                      mn.level === 'info' && styles.noticePillInfo,
                    ]}
                  >
                    <View style={styles.modalNoteContent}>
                      <Text style={styles.modalNoteLevel}>{mn.level.toUpperCase()}</Text>
                      <Text style={styles.modalNoteText}>{mn.note}</Text>
                    </View>
                    {mn.level !== 'critical' ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => void dismissNote(mn.id)}
                        style={styles.modalDismiss}
                      >
                        <X color={colors.textSecondary} size={18} />
                      </Pressable>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Direct 1-Tap Post-Trip Report Modal from Schedule */}
      {directReport ? (
        <TripReportModal
          visible={directReport !== null}
          tourKey={directReport.tourKey}
          dateIso={dateKey}
          guideName={profile.fullName}
          tripName={directReport.tour.tourName}
          rawHeader={directReport.tour.sheetColumnHeader}
          initialPax={directReport.tour.guestCount}
          isHillHike={directReport.tour.tourCategory === 'hill_hike'}
          hillHikeLocation={
            directReport.tour.tourCategory === 'hill_hike'
              ? activeRoute.id === 'rundfjellet'
                ? 'Rundfjellet'
                : 'Tverrfjellet'
              : ''
          }
          onClose={() => setDirectReport(null)}
          onSubmitted={() => {
            setDirectReport(null);
            void refreshReports();
          }}
        />
      ) : null}
      {/* Company Tour Read-Only Sheet Details Modal (All Trips View) */}
      <Modal
        visible={inspectedCompanyTour !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setInspectedCompanyTour(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {inspectedCompanyTour?.tourName ?? 'Tour Details'}
              </Text>
              <Pressable
                onPress={() => setInspectedCompanyTour(null)}
                style={styles.modalClose}
              >
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {inspectedCompanyTour ? (
                <>
                  <View style={styles.companyDetailCard}>
                    <Text style={styles.companyDetailLabel}>
                      SCHEDULE CELL
                      {inspectedCompanyTour.sheetColumnHeader
                        ? ` · ${inspectedCompanyTour.sheetColumnHeader.toUpperCase()}`
                        : ''}
                    </Text>
                    <Text style={styles.companyDetailText} selectable>
                      {inspectedCompanyTour.rawText}
                    </Text>
                  </View>

                  {inspectedCompanyTour.vehicle || inspectedCompanyTour.meetingPoint ? (
                    <View style={styles.companyDetailCard}>
                      <Text style={styles.companyDetailLabel}>LOGISTICS</Text>
                      {inspectedCompanyTour.vehicle ? (
                        <Text style={styles.companyDetailText}>
                          Vehicle: {inspectedCompanyTour.vehicle}
                        </Text>
                      ) : null}
                      {inspectedCompanyTour.meetingPoint ? (
                        <Text style={styles.companyDetailText}>
                          Meeting Point: {inspectedCompanyTour.meetingPoint}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {inspectedCompanyTour.cellNote ? (
                    <View style={styles.companyDetailCard}>
                      <Text style={styles.companyDetailLabel}>CELL NOTE</Text>
                      <Text style={styles.companyDetailText} selectable>
                        {inspectedCompanyTour.cellNote}
                      </Text>
                    </View>
                  ) : null}

                  {inspectedCompanyTour.commentsList.map((c, idx) => (
                    <View key={idx} style={styles.companyDetailCard}>
                      <Text style={styles.companyDetailLabel}>COMMENT · {c.author}</Text>
                      <Text style={styles.companyDetailText} selectable>
                        {c.content}
                      </Text>
                      {c.replies.map((r, rIdx) => (
                        <Text key={rIdx} style={styles.companyReplyText} selectable>
                          {r.author || 'Reply'}: {r.content}
                        </Text>
                      ))}
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Guide Notes (Column L) Full-Text Modal */}
      <Modal
        visible={showGuideNotesModal && guideDayNotes !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setShowGuideNotesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Guide Notes ({dateLabel})</Text>
              <Pressable
                onPress={() => setShowGuideNotesModal(false)}
                style={styles.modalClose}
              >
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {guideDayNotes?.text ? (
                <View style={styles.companyDetailCard}>
                  <Text style={styles.companyDetailLabel}>GUIDE NOTES (COL L)</Text>
                  <Text style={styles.companyDetailText} selectable>
                    {guideDayNotes.text}
                  </Text>
                </View>
              ) : null}

              {guideDayNotes?.cellNote ? (
                <View style={styles.companyDetailCard}>
                  <Text style={styles.companyDetailLabel}>CELL NOTE</Text>
                  <Text style={styles.companyDetailText} selectable>
                    {guideDayNotes.cellNote}
                  </Text>
                </View>
              ) : null}

              {guideDayNotes?.commentsList.map((c, idx) => (
                <View key={idx} style={styles.companyDetailCard}>
                  <Text style={styles.companyDetailLabel}>COMMENT · {c.author}</Text>
                  <Text style={styles.companyDetailText} selectable>
                    {c.content}
                  </Text>
                  {c.replies.map((r, rIdx) => (
                    <Text key={rIdx} style={styles.companyReplyText} selectable>
                      {r.author || 'Reply'}: {r.content}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <WeatherAlertModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />

      <ScheduleCalendarModal
        visible={showCalendarModal}
        selectedDate={selectedDate}
        syncData={syncData}
        profile={profile}
        onSelectDate={selectDate}
        onSelectToday={resetToToday}
        onClose={() => setShowCalendarModal(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 32,
    gap: 10,
  },
  slimSyncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  slimSyncText: { flex: 1 },
  syncName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  syncTime: { color: colors.accentSoft, fontSize: 11, fontWeight: '600' },
  slimSyncBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iticketSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
  },
  iticketSyncText: {
    color: colors.ice,
    fontSize: 12,
    fontWeight: '800',
  },
  guideNotesCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guideNotesCopy: { flex: 1, gap: 3 },
  guideNotesTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  guideNotesLabel: {
    color: colors.ice,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  guideNotesHint: {
    color: colors.ice,
    fontSize: 11,
    fontWeight: '800',
  },
  guideNotesText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ice,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  updateBannerText: {
    flex: 1,
    color: colors.background,
    fontSize: 13,
    fontWeight: '800',
  },
  updateBannerAction: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 6,
    minHeight: 48,
  },
  dateNavBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  dateCenter: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 1 },
  dateCenterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateLabelText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  datePickerHint: { color: colors.textSecondary, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  todayQuickBtn: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginRight: 2,
  },
  todayQuickText: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  viewToggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  viewToggleBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.accent,
  },
  viewToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  viewToggleTextActive: {
    color: colors.background,
  },
  allTripsWrap: { gap: 10 },
  opsSummaryCard: { gap: 6, padding: 12 },
  opsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  opsHeaderTitle: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  vehicleSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    borderTopColor: colors.borderSubtle,
    borderTopWidth: 1,
    paddingTop: 5,
  },
  vehicleSummaryName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  vehicleSummaryDetail: {
    color: colors.ice,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  emptyAllCard: { padding: 14, alignItems: 'center' },
  tourCardMine: { borderColor: colors.accent },
  mineBadge: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mineBadgeText: { color: colors.accentSoft, fontSize: 9, fontWeight: '900' },
  allGuidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  allGuidesLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  guidePill: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  guidePillMine: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
  },
  guidePillText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  guidePillTextMine: { color: colors.accentSoft },
  allGuidesFallback: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  companyDetailCard: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  companyDetailLabel: { color: colors.accentSoft, fontSize: 10, fontWeight: '800' },
  companyDetailText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  companyReplyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
    marginTop: 4,
  },
  noticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  noticePillCritical: { backgroundColor: colors.dangerDarkBg, borderColor: colors.danger },
  noticePillWarning: { backgroundColor: colors.warningDarkBg, borderColor: colors.warning },
  noticePillInfo: { backgroundColor: colors.iceDarkBg, borderColor: colors.ice },
  noticePillText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  noticePillAction: { color: colors.text, fontSize: 12, fontWeight: '800' },
  reportReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  reportReminderText: { flex: 1, color: colors.background, fontSize: 13, fontWeight: '800' },
  reportReminderAction: { color: colors.background, fontSize: 13, fontWeight: '900' },
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  dutyCardOff: { backgroundColor: colors.successDarkBg, borderColor: colors.success },
  dutyCardBase: { backgroundColor: colors.warningDarkBg, borderColor: colors.warning },
  dutyTextCol: { flex: 1, gap: 2 },
  dutyTitle: { fontSize: 15, fontWeight: '800' },
  dutyDetail: { color: colors.textSecondary, fontSize: 12 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  alertCopy: { flex: 1, gap: 2 },
  alertTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  alertTitle: { color: colors.warning, fontSize: 13, fontWeight: '800', flex: 1 },
  alertDetailsHint: { fontSize: 11, fontWeight: '800' },
  alertRangeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  alertDetail: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  tourCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  tourHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  tourTag: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  badgesRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  statusColorBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusColorText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  shipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  shipText: { color: colors.ice, fontSize: 10, fontWeight: '800' },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  vehicleText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  tourTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  tourFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  paxChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  paxText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  reportDoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successDarkBg,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reportDoneText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  reportNeededChip: {
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reportNeededText: { color: colors.warning, fontSize: 11, fontWeight: '800' },
  openHint: { color: colors.accent, fontSize: 13, fontWeight: '800', marginLeft: 'auto' },
  weatherCheckCard: { gap: 10, padding: 12 },
  weatherTapArea: { gap: 10 },
  checkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkTitleCol: { flex: 1, gap: 1 },
  checkTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  checkWindowLabel: { color: colors.accentSoft, fontSize: 11, fontWeight: '700' },
  weatherUnavailableText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 2 },
  weatherLinkHint: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  avBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  avBadgeText: { fontSize: 10, fontWeight: '800' },
  summitRow: { flexDirection: 'row', gap: 8 },
  summitBox: {
    flex: 1,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 2,
  },
  summitName: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  summitWind: { color: colors.text, fontSize: 15, fontWeight: '800' },
  summitGust: { color: colors.ice, fontSize: 11, fontWeight: '700' },
  singleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  singleSummaryTemp: { color: colors.text, fontSize: 24, fontWeight: '800' },
  singleSummaryWind: { color: colors.ice, fontSize: 13, fontWeight: '700' },
  bridgeStrip: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bridgeStripDanger: { backgroundColor: colors.dangerDarkBg, borderColor: colors.danger },
  bridgeText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  browseToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  browseToggleText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  weekCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  weekScroll: {
    maxHeight: 280,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 10,
  },
  weekDay: { color: colors.text, fontSize: 12, fontWeight: '800', width: 90 },
  weekStatus: { color: colors.textSecondary, fontSize: 12, flex: 1, textAlign: 'right' },
  routesList: { gap: 6 },
  routeRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeLeft: { flex: 1, gap: 2 },
  routeName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  routeArea: { color: colors.textSecondary, fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  modalClose: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 14, gap: 10, paddingBottom: 28 },
  modalNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  modalNoteContent: { flex: 1, gap: 3 },
  modalNoteLevel: { color: colors.textSecondary, fontSize: 10, fontWeight: '900' },
  modalNoteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  modalDismiss: { padding: 4 },
  pressed: { opacity: 0.75 },
});