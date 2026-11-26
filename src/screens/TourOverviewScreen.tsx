import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Bus,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  FileWarning,
  MapPin,
  MessageSquare,
  Mountain,
  Navigation,
  Phone,
  Plus,
  Ship,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';

import { TripReportModal } from '../components/TripReportModal';
import { WeatherAlertModal } from '../components/WeatherAlertModal';
import { WeatherIcon } from '../components/WeatherIcon';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { matchContactsForTour } from '../data/contacts';
import {
  getRouteById,
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
} from '../data/routes';
import { routeIdToWeatherSpotId } from '../data/weatherSpots';
import { useChecklist } from '../hooks/useChecklist';
import { useDualForecast } from '../hooks/useDualForecast';
import { useRoster } from '../hooks/useRoster';
import {
  alertSeverityColors,
  avalancheDangerColor,
  fetchTromsoAvalanche,
  fetchWeatherAlerts,
  type AvalancheWarning,
  type WeatherAlertItem,
} from '../services/alertsService';
import { summarizeForecastWindow } from '../services/weatherService';
import { colors, sharedStyles, touchTarget } from '../theme';
import {
  calculateWindChill,
  exposureRisk,
  metersPerSecondToKmh,
  tromsoDaylight,
  windCardinal,
} from '../utils/environmental';
import { formatClock, formatTemperature, osloDateKey } from '../utils/format';

export type ScheduleStackParamList = {
  ScheduleHome: undefined;
  TourOverview:
    | { openReport?: boolean; reportTriggerId?: number; targetTourIdx?: number }
    | undefined;
  DetailedWeather: { spotId?: string } | undefined;
  Tracking: undefined;
};

type NavProp = NativeStackNavigationProp<ScheduleStackParamList, 'TourOverview'>;
type OverviewRouteProp = RouteProp<ScheduleStackParamList, 'TourOverview'>;

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

export function TourOverviewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<OverviewRouteProp>();
  const {
    profile,
    activeAssignment,
    activeRoute,
    selectedAssignmentIdx,
    isManualTripView,
    selectedDate,
    tourKey,
    submittedReports,
    refreshReports,
    setHillHikeMountain,
  } = useActiveTour();

  const isHillHike =
    activeAssignment?.tourCategory === 'hill_hike' || activeRoute.category === 'hill_hike';

  const tverrRoute = getRouteById('tverrfjellet');
  const rundRoute = getRouteById('rundfjellet');

  const dualForecast = useDualForecast(activeRoute.weatherPoint, activeRoute.summit);
  const tverrTopForecast = useDualForecast(tverrRoute.summit!, null);
  const rundTopForecast = useDualForecast(rundRoute.summit!, null);
  const bridgeForecast = useDualForecast(SANDNESSUNDBRUA_POINT, null);

  const checklist = useChecklist(activeRoute.checklistId, tourKey);
  const roster = useRoster(tourKey);

  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<WeatherAlertItem | null>(null);
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSheetDetailsModal, setShowSheetDetailsModal] = useState(false);
  const lastReportTriggerRef = useRef<number | null>(null);

  useEffect(() => {
    const triggerId = route.params?.reportTriggerId ?? null;
    const targetTourIdx = route.params?.targetTourIdx;
    if (
      route.params?.openReport &&
      activeAssignment &&
      triggerId !== lastReportTriggerRef.current &&
      (targetTourIdx === undefined || selectedAssignmentIdx === targetTourIdx)
    ) {
      lastReportTriggerRef.current = triggerId;
      setShowReportModal(true);
    }
  }, [
    route.params?.openReport,
    route.params?.reportTriggerId,
    route.params?.targetTourIdx,
    activeAssignment,
    selectedAssignmentIdx,
  ]);

  const [editingKit, setEditingKit] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [creatingKit, setCreatingKit] = useState(false);
  const [newKitName, setNewKitName] = useState('');

  useEffect(() => {
    let active = true;
    void fetchWeatherAlerts(activeRoute.weatherPoint, selectedDate).then((items) => {
      if (active) setWeatherAlerts(items);
    });
    if (isHillHike) {
      void fetchTromsoAvalanche(selectedDate).then((av) => {
        if (active) setAvalanche(av);
      });
    } else {
      setAvalanche(null);
    }
    return () => {
      active = false;
    };
  }, [activeRoute.weatherPoint, isHillHike, selectedDate]);

  const reportRecord = submittedReports[tourKey] ?? null;

  const dateKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);
  const startMin = activeAssignment?.startMinutes ?? null;
  const endMin = activeAssignment?.endMinutes ?? null;

  const tourEnded = useMemo(() => {
    const todayKey = osloDateKey(new Date());
    if (dateKey < todayKey) return true;
    if (dateKey > todayKey) return false;
    if (endMin === null) return false;
    return getOsloMinutes(new Date()) >= endMin;
  }, [dateKey, endMin]);

  const bottomSummary = useMemo(
    () => summarizeForecastWindow(dualForecast.bottom?.hourly, dateKey, startMin, endMin),
    [dualForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const topSummary = useMemo(
    () => summarizeForecastWindow(dualForecast.top?.hourly, dateKey, startMin, endMin),
    [dualForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const tverrTopSummary = useMemo(
    () => summarizeForecastWindow(tverrTopForecast.bottom?.hourly, dateKey, startMin, endMin),
    [tverrTopForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const rundTopSummary = useMemo(
    () => summarizeForecastWindow(rundTopForecast.bottom?.hourly, dateKey, startMin, endMin),
    [rundTopForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgeSummary = useMemo(() => {
    if (!activeRoute.usesBridgeWarning) return null;
    return summarizeForecastWindow(
      bridgeForecast.bottom?.hourly,
      dateKey,
      startMin !== null ? Math.max(0, startMin - 60) : null,
      endMin !== null ? Math.min(24 * 60, endMin + 60) : null
    );
  }, [activeRoute.usesBridgeWarning, bridgeForecast.bottom?.hourly, dateKey, startMin, endMin]);

  const bottomWeather = bottomSummary.repHour;
  const topWeather = topSummary.repHour;

  const bridgeAlert =
    bridgeSummary !== null &&
    bridgeSummary.hasData &&
    bridgeSummary.peakGustMs >= SANDNESSUNDBRUA_GUST_WARNING_MS;

  const weatherUnavailableText =
    bottomSummary.unavailableReason === 'past'
      ? 'Forecast unavailable (past date)'
      : bottomSummary.unavailableReason === 'beyond_range'
        ? 'Forecast unavailable (>9 days out)'
        : 'Loading forecast…';

  const primaryWeather = topWeather ?? bottomWeather;
  const primaryPeakWindMs = topSummary.hasData
    ? topSummary.peakWindMs
    : bottomSummary.hasData
      ? bottomSummary.peakWindMs
      : primaryWeather?.windSpeedMs ?? null;
  const feltChill =
    primaryWeather && primaryPeakWindMs !== null
      ? calculateWindChill(
          primaryWeather.airTemperatureC,
          metersPerSecondToKmh(primaryPeakWindMs)
        )
      : null;
  const risk = feltChill !== null ? exposureRisk(feltChill) : null;

  const daylight = useMemo(() => tromsoDaylight(selectedDate), [selectedDate]);
  const completedCount = checklist.activeTemplate.items.filter(
    (i) => checklist.checked[i.id]
  ).length;

  const pinnedContacts = useMemo(() => {
    if (!activeAssignment) return [];
    const commentsText = activeAssignment.commentsList
      .map((c) => `${c.content} ${c.replies.map((r) => r.content).join(' ')}`)
      .join(' ');
    return matchContactsForTour({
      shipName: activeAssignment.shipName,
      tourName: activeAssignment.tourName,
      rawText: activeAssignment.rawText,
      cellNote: activeAssignment.cellNote,
      commentsText,
    });
  }, [activeAssignment]);

  const concreteReturnClock = useMemo(() => {
    if (!activeAssignment || activeAssignment.endMinutes === null) return null;
    const margin =
      activeRoute.backAtParkingBeforeEndMinutes ??
      (activeRoute.driveMinutesEachWay > 0 ? activeRoute.driveMinutesEachWay : 0);
    if (margin <= 0) return null;
    const backMin = activeAssignment.endMinutes - margin;
    const h = Math.floor(backMin / 60) % 24;
    const m = backMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [activeAssignment, activeRoute]);

  const expectedPax = activeAssignment?.guestCount ?? 0;
  const currentRosterPax = roster.totalGuestsCount;
  const displayMeetingPoint = activeAssignment?.meetingPoint ?? activeRoute.meetingPoint ?? null;

  const dialPhone = async (phone: string) => {
    const cleaned = phone.replace(/\s+/g, '');
    try {
      await Linking.openURL(`tel:${cleaned}`);
    } catch {
      // Fallback handled by OS
    }
  };

  const openRosterTab = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('Roster' as never);
    }
  };

  const openBridgeWeather = () => {
    navigation.navigate('DetailedWeather', { spotId: 'kvaloya-bridge' });
  };

  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    checklist.addItem(newItemText);
    setNewItemText('');
  };

  const handleCreateKit = () => {
    if (!newKitName.trim()) return;
    checklist.createTemplate(newKitName);
    setNewKitName('');
    setCreatingKit(false);
  };

  const avColors = avalanche ? avalancheDangerColor(avalanche.dangerLevel) : null;
  const isDriverOnly = activeAssignment?.role === 'driver';
  const showReportAtTop = Boolean(activeAssignment && !isDriverOnly && tourEnded && !reportRecord);

  const renderPostTripReportButton = () => {
    if (!activeAssignment || isDriverOnly) return null;
    return (
      <Pressable
        onPress={() => setShowReportModal(true)}
        style={({ pressed }) => [
          touchTarget,
          styles.reportBtn,
          reportRecord
            ? styles.reportBtnDone
            : tourEnded
              ? styles.reportBtnNeeded
              : styles.reportBtnDefault,
          pressed && styles.pressed,
        ]}
      >
        {reportRecord ? (
          <CheckCircle2 color={colors.success} size={22} />
        ) : (
          <ClipboardList
            color={tourEnded ? colors.background : colors.accent}
            size={22}
          />
        )}
        <View style={styles.reportCopy}>
          <Text
            style={[
              styles.reportTitle,
              reportRecord && { color: colors.success },
              !reportRecord && tourEnded && { color: colors.background },
            ]}
          >
            {reportRecord
              ? `Report Submitted (${formatClock(new Date(reportRecord.submittedAtIso))})`
              : tourEnded
                ? 'Post-Trip Report Needed'
                : 'Post-Trip Report'}
          </Text>
          <Text
            style={[
              styles.reportSub,
              !reportRecord && tourEnded && { color: colors.background, opacity: 0.85 },
            ]}
          >
            {reportRecord
              ? reportRecord.queuedOffline
                ? 'Saved offline · Will sync when online · Tap to edit'
                : `Submitted (${reportRecord.attendedPax} joined) · Tap to edit`
              : 'Pre-filled with guide, tour, date & attended pax'}
          </Text>
        </View>
        <ChevronRight
          color={!reportRecord && tourEnded ? colors.background : colors.textSecondary}
          size={20}
        />
      </Pressable>
    );
  };

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      {/* 1. Tour Briefing Card */}
      <View style={styles.briefCard}>
        <View style={styles.briefTopRow}>
          <Text style={styles.categoryTag}>
            {isManualTripView
              ? `TRIP INFO · ${activeRoute.area.toUpperCase()}`
              : activeAssignment?.isCharter
                ? 'CHARTER'
                : activeRoute.area.toUpperCase()}
          </Text>
          {activeAssignment?.startTimeLabel ? (
            <View style={styles.timePill}>
              <Text style={styles.timePillText}>
                {activeAssignment.startTimeLabel}
                {activeAssignment.endTimeLabel ? `–${activeAssignment.endTimeLabel}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.tourTitle}>
          {activeAssignment ? activeAssignment.tourName : activeRoute.name}
        </Text>

        <View style={styles.infoRow}>
          {isDriverOnly ? (
            <View style={styles.infoChipShip}>
              <Bus color={colors.ice} size={15} />
              <Text style={styles.infoChipShipText}>
                {activeAssignment && activeAssignment.drivers.length > 1 && activeAssignment.driverLabel
                  ? `Driver (${activeAssignment.driverLabel})`
                  : 'Driver Shift'}
              </Text>
            </View>
          ) : null}

          {isDriverOnly && activeAssignment && activeAssignment.assignedGuides.length > 0 ? (
            <View style={styles.infoChip}>
              <Text style={styles.infoChipText}>
                Guide: {activeAssignment.assignedGuides.join('/')}
              </Text>
            </View>
          ) : null}

          {!isDriverOnly && activeAssignment?.driverLabel ? (
            <View style={styles.infoChip}>
              <Bus color={colors.ice} size={15} />
              <Text style={styles.infoChipText}>Driver: {activeAssignment.driverLabel}</Text>
            </View>
          ) : null}

          {activeAssignment?.shipName ? (
            <View style={styles.infoChipShip}>
              <Ship color={colors.ice} size={15} />
              <Text style={styles.infoChipShipText}>{activeAssignment.shipName}</Text>
            </View>
          ) : null}

          {displayMeetingPoint ? (
            <View style={styles.infoChip}>
              <MapPin color={colors.ice} size={15} />
              <Text style={styles.infoChipText}>{displayMeetingPoint}</Text>
            </View>
          ) : null}

          {!isManualTripView ? (
            <View style={styles.infoChip}>
              <Bus color={colors.accent} size={15} />
              <Text style={styles.infoChipText}>
                {activeAssignment?.vehicle ||
                  (activeRoute.driveMinutesEachWay === 0 ? 'Starts at Shop' : 'Vehicle TBD')}
              </Text>
            </View>
          ) : null}

          {concreteReturnClock ? (
            <View style={styles.infoChip}>
              <Clock color={colors.accent} size={15} />
              <Text style={styles.infoChipText}>Back at car {concreteReturnClock}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.returnNote}>{activeRoute.returnNote}</Text>

        {activeAssignment?.cellNote ? (
          <Pressable
            onPress={() => setShowSheetDetailsModal(true)}
            style={({ pressed }) => [styles.noteBox, pressed && styles.pressed]}
          >
            <View style={styles.commentHeader}>
              <Text style={styles.noteLabel}>NOTE</Text>
              <Text style={styles.readFullHint}>Sheet Details →</Text>
            </View>
            <Text style={styles.noteText} numberOfLines={3}>
              {activeAssignment.cellNote}
            </Text>
          </Pressable>
        ) : null}

        {activeAssignment && activeAssignment.commentsList.length > 0 ? (
          <Pressable
            onPress={() => setShowSheetDetailsModal(true)}
            style={({ pressed }) => [styles.noteBox, pressed && styles.pressed]}
          >
            <View style={styles.commentHeader}>
              <MessageSquare color={colors.accent} size={14} />
              <Text style={styles.noteLabel}>OFFICE COMMENTS</Text>
              <Text style={styles.readFullHint}>Tap for full →</Text>
            </View>
            {activeAssignment.commentsList.map((c, idx) => (
              <Text key={idx} style={styles.noteText} numberOfLines={3}>
                <Text style={{ fontWeight: '800' }}>{c.author}: </Text>
                {c.content}
              </Text>
            ))}
          </Pressable>
        ) : null}

        {activeAssignment ? (
          <Pressable
            onPress={() => setShowSheetDetailsModal(true)}
            style={({ pressed }) => [styles.sheetCellBar, pressed && styles.pressed]}
          >
            <FileText color={colors.ice} size={15} />
            <View style={styles.sheetCellCopy}>
              <Text style={styles.sheetCellLabel}>SHEET DETAILS · RAW CELL</Text>
              <Text style={styles.sheetCellPreview} numberOfLines={1}>
                {activeAssignment.rawText || '(Empty cell)'}
              </Text>
            </View>
            <Text style={styles.readFullHint}>Inspect →</Text>
          </Pressable>
        ) : null}
      </View>

      {/* 2. Auto-Pinned Ship & Tour Contacts */}
      {pinnedContacts.length > 0 ? (
        <View style={styles.contactsCard}>
          <Text style={styles.contactsHeader}>AUTO-PINNED TOUR CONTACTS</Text>
          {pinnedContacts.map((contact) => (
            <View key={contact.id} style={styles.contactRow}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>
              <View style={styles.contactButtons}>
                <Pressable
                  onPress={() => void dialPhone(contact.phone)}
                  style={({ pressed }) => [styles.callPill, pressed && styles.pressed]}
                >
                  <Phone color={colors.background} size={15} />
                  <Text style={styles.callPillText}>Call</Text>
                </Pressable>
                {contact.secondaryPhone ? (
                  <Pressable
                    onPress={() => void dialPhone(contact.secondaryPhone!)}
                    style={({ pressed }) => [styles.callPillSecondary, pressed && styles.pressed]}
                  >
                    <Phone color={colors.text} size={14} />
                    <Text style={styles.callPillSecondaryText}>
                      {contact.secondaryLabel ?? 'Rec.'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* 3. Post-Trip Report Button promoted to top ONLY after tour ends & still missing */}
      {showReportAtTop ? renderPostTripReportButton() : null}

      {/* 4. Morning Mountain Picker (Hill Hikes Only) */}
      {isHillHike ? (
        <View style={[sharedStyles.card, styles.mountainPickerCard]}>
          <View style={styles.pickerHeader}>
            <Mountain color={colors.accent} size={18} />
            <Text style={styles.pickerTitle}>CHOOSE TODAY’S MOUNTAIN</Text>
          </View>
          <View style={styles.pickerRow}>
            <Pressable
              onPress={() => setHillHikeMountain('tverrfjellet')}
              style={[
                touchTarget,
                styles.mountainOption,
                activeRoute.id === 'tverrfjellet' && styles.mountainOptionActive,
              ]}
            >
              <Text
                style={[
                  styles.mountainName,
                  activeRoute.id === 'tverrfjellet' && styles.mountainTextActive,
                ]}
              >
                Tverrfjellet (524m)
              </Text>
              <Text
                style={[
                  styles.mountainWind,
                  activeRoute.id === 'tverrfjellet' && styles.mountainTextActive,
                ]}
              >
                {tverrTopSummary.hasData
                  ? `Max ${tverrTopSummary.peakWindMs.toFixed(1)} m/s${
                      tverrTopSummary.dirDeg !== null
                        ? ` ${windCardinal(tverrTopSummary.dirDeg)}`
                        : ''
                    } · 45m drive`
                  : '45m drive'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setHillHikeMountain('rundfjellet')}
              style={[
                touchTarget,
                styles.mountainOption,
                activeRoute.id === 'rundfjellet' && styles.mountainOptionActive,
              ]}
            >
              <Text
                style={[
                  styles.mountainName,
                  activeRoute.id === 'rundfjellet' && styles.mountainTextActive,
                ]}
              >
                Rundfjellet (472m)
              </Text>
              <Text
                style={[
                  styles.mountainWind,
                  activeRoute.id === 'rundfjellet' && styles.mountainTextActive,
                ]}
              >
                {rundTopSummary.hasData
                  ? `Max ${rundTopSummary.peakWindMs.toFixed(1)} m/s${
                      rundTopSummary.dirDeg !== null
                        ? ` ${windCardinal(rundTopSummary.dirDeg)}`
                        : ''
                    } · 30m drive`
                  : '30m drive'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 5. Guests Tile + iTicket Quick Check (only for live scheduled assignments) */}
      {!isManualTripView ? (
        <View style={styles.guestActionRow}>
          <Pressable
            onPress={openRosterTab}
            style={({ pressed }) => [touchTarget, styles.guestTileWide, pressed && styles.pressed]}
          >
            <View style={styles.guestTileLeft}>
              <Users color={colors.accent} size={22} />
              <View style={styles.guestTileCopy}>
                <Text style={styles.guestTileTitle} numberOfLines={1}>
                  {expectedPax > 0 ? `${expectedPax} Guests Expected` : 'Open Bookings'}
                </Text>
                <Text style={styles.guestTileSub} numberOfLines={1}>
                  {currentRosterPax} on scratchpad · Roster
                </Text>
              </View>
            </View>
            <ChevronRight color={colors.textSecondary} size={20} />
          </Pressable>

          <Pressable
            onPress={() => void Linking.openURL(CONFIG.links.iticketPortal)}
            style={({ pressed }) => [touchTarget, styles.iticketTileBtn, pressed && styles.pressed]}
          >
            <ExternalLink color={colors.ice} size={18} />
            <Text style={styles.iticketTileText}>iTicket</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 6. Full Tour Window Weather Card */}
      <Pressable
        onPress={() =>
          navigation.navigate('DetailedWeather', {
            spotId: routeIdToWeatherSpotId(activeRoute.id),
          })
        }
        style={({ pressed }) => [sharedStyles.card, styles.weatherStrip, pressed && styles.pressed]}
      >
        <View style={styles.weatherStripTop}>
          <Text style={styles.sectionMiniLabel}>
            TOUR WINDOW WEATHER
            {bottomSummary.windowLabel ? ` · ${bottomSummary.windowLabel.toUpperCase()}` : ''}
          </Text>
          <Text style={styles.linkText}>Full Forecast →</Text>
        </View>

        {!bottomSummary.hasData ? (
          <Text style={styles.weatherUnavailable}>{weatherUnavailableText}</Text>
        ) : activeRoute.summit ? (
          <View style={styles.dualMiniRow}>
            <View style={styles.dualMiniCol}>
              <Text style={styles.dualMiniTitle}>
                Bottom ({activeRoute.trailhead.elevationMeters}m)
              </Text>
              <Text style={styles.dualMiniVal}>
                {bottomWeather ? formatTemperature(bottomWeather.airTemperatureC) : '—'} ·{' '}
                {bottomSummary.hasData ? `max ${bottomSummary.peakWindMs.toFixed(1)} m/s` : '—'}
              </Text>
            </View>
            <View style={styles.dualMiniCol}>
              <Text style={styles.dualMiniTitle}>
                Top ({activeRoute.summit.elevationMeters}m)
              </Text>
              <Text style={styles.dualMiniVal}>
                {topWeather ? formatTemperature(topWeather.airTemperatureC) : '—'} ·{' '}
                {topSummary.hasData ? `max ${topSummary.peakWindMs.toFixed(1)} m/s` : '—'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.singleWeatherRow}>
            <WeatherIcon symbolCode={bottomWeather?.symbolCode ?? null} size={28} />
            <Text style={styles.singleWeatherLine}>
              {bottomWeather
                ? `${formatTemperature(bottomWeather.airTemperatureC)} · Max wind ${bottomSummary.peakWindMs.toFixed(1)} m/s`
                : weatherUnavailableText}
            </Text>
          </View>
        )}

        <View style={styles.weatherStripFooter}>
          {bottomSummary.hasData && risk && feltChill !== null ? (
            <Text style={[styles.feltPill, { color: risk.color }]}>
              Felt {formatTemperature(feltChill)} · {risk.label}
            </Text>
          ) : (
            <View />
          )}
          <Text style={styles.daylightMini}>
            Dusk {formatClock(daylight.clocks.civilDusk)}
          </Text>
        </View>
      </Pressable>

      {/* 7. Grouped Weather & Safety Warnings (Avalanche + Clickable Yr/MET + Bridge) */}
      {isHillHike && avalanche && avColors ? (
        <View
          style={[
            styles.avalancheCard,
            { backgroundColor: avColors.bg, borderColor: avColors.color },
          ]}
        >
          <View style={styles.avalancheTop}>
            <Text style={[styles.avalancheLevel, { color: avColors.color }]}>
              AVALANCHE LEVEL {avalanche.dangerLevel}/5
              {avalanche.dangerLevelName ? ` · ${avalanche.dangerLevelName.toUpperCase()}` : ''}
            </Text>
            {avalanche.exposedHeight1 > 0 ? (
              <Text style={styles.avalancheHeight}>Above {avalanche.exposedHeight1}m</Text>
            ) : null}
          </View>
          {avalanche.problems.length > 0 ? (
            <Text style={styles.avalancheProblems}>
              Problems: {avalanche.problems.join(' · ')}
            </Text>
          ) : null}
          {avalanche.mainText ? (
            <Text style={styles.avalancheMain} numberOfLines={3}>
              {avalanche.mainText}
            </Text>
          ) : null}
        </View>
      ) : null}

      {weatherAlerts.map((alert) => {
        const palette = alertSeverityColors(alert.riskColor);
        return (
          <Pressable
            key={alert.id}
            onPress={() => setSelectedAlert(alert)}
            style={({ pressed }) => [
              styles.metAlertCard,
              { backgroundColor: palette.bg, borderColor: palette.color },
              pressed && styles.pressed,
            ]}
          >
            <AlertTriangle color={palette.color} size={20} />
            <View style={styles.alertCopy}>
              <View style={styles.alertHeaderRow}>
                <Text style={[styles.metAlertTitle, { color: palette.color }]} numberOfLines={1}>
                  {alert.event} ({alert.severity})
                </Text>
                <Text style={[styles.alertDetailsHint, { color: palette.color }]}>
                  Details →
                </Text>
              </View>
              {alert.validRangeLabel ? (
                <Text style={styles.alertRangeText}>{alert.validRangeLabel}</Text>
              ) : null}
              <Text style={styles.alertDetailText} numberOfLines={2}>
                {alert.headline}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {bridgeAlert && bridgeSummary ? (
        <Pressable
          onPress={openBridgeWeather}
          style={({ pressed }) => [styles.bridgeAlert, pressed && styles.pressed]}
        >
          <AlertTriangle color={colors.danger} size={22} />
          <View style={styles.alertCopy}>
            <Text style={styles.bridgeTitle}>
              Kvaløya Bridge Gusts {Math.round(bridgeSummary.peakGustMs)} m/s (
              {bridgeSummary.peakTime})
            </Text>
            <Text style={styles.bridgeDetail}>
              Tap to view detailed Sandnessundbrua bridge forecast →
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 8. GPS Tracking Button */}
      {activeRoute.hasActiveTracking ? (
        <Pressable
          onPress={() => navigation.navigate('Tracking')}
          style={({ pressed }) => [touchTarget, styles.trackingBtn, pressed && styles.pressed]}
        >
          <Navigation color={colors.background} size={22} />
          <View style={styles.trackingBtnCopy}>
            <Text style={styles.trackingBtnTitle}>Open Trail & Gate Tracking</Text>
            <Text style={styles.trackingBtnSub}>
              {activeRoute.gates.length} checkpoints · {activeRoute.totalDistanceKm.toFixed(1)} km
            </Text>
          </View>
          <ChevronRight color={colors.background} size={22} />
        </Pressable>
      ) : null}

      {/* 9. Custom & Editable Equipment Checklist */}
      <View style={styles.checklistHeader}>
        <Text style={sharedStyles.sectionTitle}>{checklist.activeTemplate.title}</Text>
        <View style={styles.checklistActions}>
          <Text style={styles.checklistCount}>
            {completedCount}/{checklist.activeTemplate.items.length}
          </Text>
          <Pressable
            onPress={() => setEditingKit((v) => !v)}
            style={styles.editKitBtn}
          >
            <Text style={styles.editKitText}>{editingKit ? 'Done' : 'Edit / Kits'}</Text>
          </Pressable>
        </View>
      </View>

      {editingKit ? (
        <View style={styles.kitManagerBox}>
          <Text style={styles.kitManagerLabel}>ASSIGN KIT TO THIS TOUR</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.kitPillsRow}
          >
            {checklist.allTemplates.map((kit) => {
              const active = kit.id === checklist.activeTemplate.id;
              return (
                <Pressable
                  key={kit.id}
                  onPress={() => checklist.selectTemplateForTour(kit.id)}
                  style={[styles.kitPill, active && styles.kitPillActive]}
                >
                  <Text style={[styles.kitPillText, active && styles.kitPillTextActive]}>
                    {kit.title}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setCreatingKit((v) => !v)}
              style={styles.kitPillAdd}
            >
              <Plus color={colors.accent} size={14} />
              <Text style={styles.kitPillAddText}>New Kit</Text>
            </Pressable>
          </ScrollView>

          {creatingKit ? (
            <View style={styles.inlineInputRow}>
              <TextInput
                value={newKitName}
                onChangeText={setNewKitName}
                placeholder="New kit name (e.g. Extreme Cold)"
                placeholderTextColor={colors.textSecondary}
                style={styles.inlineInput}
              />
              <Pressable onPress={handleCreateKit} style={styles.inlineAddBtn}>
                <Text style={styles.inlineAddText}>Create</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inlineInputRow}>
            <TextInput
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Add equipment item..."
              placeholderTextColor={colors.textSecondary}
              style={styles.inlineInput}
            />
            <Pressable onPress={handleAddChecklistItem} style={styles.inlineAddBtn}>
              <Plus color={colors.background} size={18} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {checklist.activeTemplate.items.map((item) => {
        const checked = Boolean(checklist.checked[item.id]);
        return (
          <View key={item.id} style={styles.checkRowWrap}>
            <Pressable
              onPress={() => checklist.toggle(item.id)}
              style={({ pressed }) => [touchTarget, styles.checkRow, pressed && styles.pressed]}
            >
              <View style={styles.checkInner}>
                <View style={[styles.box, checked && styles.boxChecked]}>
                  {checked ? <Check color={colors.background} size={20} strokeWidth={3} /> : null}
                </View>
                <Text style={[styles.checkLabel, checked && styles.checkLabelDone]}>
                  {item.label}
                </Text>
              </View>
            </Pressable>
            {editingKit ? (
              <Pressable
                onPress={() => checklist.removeItem(item.id)}
                style={styles.deleteItemBtn}
              >
                <Trash2 color={colors.danger} size={16} />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {/* 10. Post-Trip Report Button at bottom before/during tour (or when already submitted) */}
      {!showReportAtTop && !isDriverOnly ? (
        <View style={styles.bottomReportWrap}>{renderPostTripReportButton()}</View>
      ) : null}

      {/* 10b. Accident / Incident Report Form Link */}
      <Pressable
        onPress={() => void Linking.openURL(CONFIG.links.accidentReportForm)}
        style={({ pressed }) => [touchTarget, styles.accidentBtn, pressed && styles.pressed]}
      >
        <FileWarning color={colors.warning} size={18} />
        <View style={styles.accidentCopy}>
          <Text style={styles.accidentTitle}>Accident / Incident Report Form</Text>
          <Text style={styles.accidentSub}>
            Open official form if an accident occurred on this trip
          </Text>
        </View>
        <ExternalLink color={colors.textSecondary} size={16} />
      </Pressable>

      {/* Combined Sheet Details Modal (Raw Cell + Note + Office Comments) */}
      <Modal
        visible={showSheetDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSheetDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sheet Details</Text>
              <Pressable
                onPress={() => setShowSheetDetailsModal(false)}
                style={styles.modalClose}
              >
                <X color={colors.text} size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {activeAssignment ? (
                <View style={styles.fullCommentCard}>
                  <Text style={styles.fullCommentAuthor}>
                    Schedule Cell
                    {activeAssignment.sheetColumnHeader
                      ? ` · ${activeAssignment.sheetColumnHeader}`
                      : ''}
                  </Text>
                  <Text style={styles.fullCommentText} selectable>
                    {activeAssignment.rawText || '(Empty cell)'}
                  </Text>
                </View>
              ) : null}

              {activeAssignment?.cellNote ? (
                <View style={styles.fullCommentCard}>
                  <Text style={styles.fullCommentAuthor}>Cell Note</Text>
                  <Text style={styles.fullCommentText} selectable>
                    {activeAssignment.cellNote}
                  </Text>
                </View>
              ) : null}

              {activeAssignment && activeAssignment.commentsList.length > 0 ? (
                activeAssignment.commentsList.map((c, idx) => (
                  <View key={idx} style={styles.fullCommentCard}>
                    <Text style={styles.fullCommentAuthor}>Comment · {c.author}</Text>
                    <Text style={styles.fullCommentText} selectable>
                      {c.content}
                    </Text>
                    {c.replies.map((r, rIdx) => (
                      <View key={rIdx} style={styles.fullReplyBox}>
                        <Text style={styles.fullReplyAuthor}>{r.author || 'Reply'}:</Text>
                        <Text style={styles.fullCommentText} selectable>
                          {r.content}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Post-Trip Report Modal */}
      {activeAssignment ? (
        <TripReportModal
          visible={showReportModal}
          tourKey={tourKey}
          dateIso={dateKey}
          guideName={profile.fullName}
          tripName={activeAssignment.tourName}
          rawHeader={activeAssignment.sheetColumnHeader}
          initialPax={currentRosterPax > 0 ? currentRosterPax : expectedPax}
          isHillHike={isHillHike}
          hillHikeLocation={
            isHillHike
              ? activeRoute.id === 'rundfjellet'
                ? 'Rundfjellet'
                : 'Tverrfjellet'
              : ''
          }
          onClose={() => setShowReportModal(false)}
          onSubmitted={() => void refreshReports()}
        />
      ) : null}
      <WeatherAlertModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  briefCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  briefTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTag: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  timePill: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timePillText: { color: colors.accentSoft, fontSize: 12, fontWeight: '800' },
  tourTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  infoChipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  infoChipShip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  infoChipShipText: { color: colors.ice, fontSize: 12, fontWeight: '800' },
  returnNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  noteBox: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    gap: 3,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteLabel: { color: colors.accentSoft, fontSize: 10, fontWeight: '800', flex: 1 },
  readFullHint: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  noteText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  sheetCellBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sheetCellCopy: { flex: 1, gap: 1 },
  sheetCellLabel: { color: colors.ice, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  sheetCellPreview: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  contactsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  contactsHeader: { color: colors.ice, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contactInfo: { flex: 1 },
  contactName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  contactPhone: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  contactButtons: { flexDirection: 'row', gap: 6 },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  callPillText: { color: colors.background, fontSize: 12, fontWeight: '800' },
  callPillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  callPillSecondaryText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  reportBtn: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  reportBtnDefault: { backgroundColor: colors.surface, borderColor: colors.border },
  reportBtnNeeded: { backgroundColor: colors.warning, borderColor: colors.warning },
  reportBtnDone: { backgroundColor: colors.successDarkBg, borderColor: colors.success },
  reportCopy: { flex: 1 },
  reportTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  reportSub: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  mountainPickerCard: { gap: 8, padding: 12 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  pickerRow: { flexDirection: 'row', gap: 8 },
  mountainOption: {
    flex: 1,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  mountainOptionActive: { backgroundColor: colors.accentDarkBg, borderColor: colors.accent },
  mountainName: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  mountainWind: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  mountainTextActive: { color: colors.accentSoft },
  avalancheCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  avalancheTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avalancheLevel: { fontSize: 13, fontWeight: '900' },
  avalancheHeight: { color: colors.text, fontSize: 11, fontWeight: '800' },
  avalancheProblems: { color: colors.text, fontSize: 11, fontWeight: '700' },
  avalancheMain: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  metAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  alertCopy: { flex: 1, gap: 2 },
  alertHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metAlertTitle: { color: colors.warning, fontSize: 13, fontWeight: '800', flex: 1 },
  alertDetailsHint: { fontSize: 11, fontWeight: '800' },
  bottomReportWrap: { marginTop: 6 },
  alertRangeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  alertDetailText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
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
  bridgeTitle: { color: '#FCA5A5', fontSize: 14, fontWeight: '800' },
  bridgeDetail: { color: colors.textSecondary, fontSize: 11 },
  guestActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  guestTileWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  guestTileLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  guestTileCopy: { flex: 1 },
  guestTileTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  guestTileSub: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  iticketTileBtn: {
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 4,
    minWidth: 78,
  },
  iticketTileText: { color: colors.ice, fontSize: 12, fontWeight: '800' },
  weatherStrip: { gap: 6, padding: 12 },
  weatherStripTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionMiniLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', flex: 1 },
  weatherUnavailable: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 4 },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  dualMiniRow: { flexDirection: 'row', gap: 8 },
  dualMiniCol: {
    flex: 1,
    backgroundColor: '#0E1116',
    borderRadius: 8,
    padding: 8,
    gap: 2,
  },
  dualMiniTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  dualMiniVal: { color: colors.text, fontSize: 13, fontWeight: '800' },
  singleWeatherRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  singleWeatherLine: { color: colors.text, fontSize: 15, fontWeight: '800' },
  weatherStripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feltPill: { fontSize: 11, fontWeight: '800' },
  daylightMini: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  trackingBtn: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  trackingBtnCopy: { flex: 1 },
  trackingBtnTitle: { color: colors.background, fontSize: 15, fontWeight: '800' },
  trackingBtnSub: { color: colors.background, fontSize: 11, fontWeight: '700', opacity: 0.85 },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  checklistActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checklistCount: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  editKitBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editKitText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  kitManagerBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  kitManagerLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  kitPillsRow: { gap: 6 },
  kitPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
  },
  kitPillActive: { backgroundColor: colors.accentDarkBg, borderColor: colors.accent },
  kitPillText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  kitPillTextActive: { color: colors.accentSoft, fontWeight: '800' },
  kitPillAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  kitPillAddText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  inlineInputRow: { flexDirection: 'row', gap: 6 },
  inlineInput: {
    flex: 1,
    minHeight: 40,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    color: colors.text,
    fontSize: 13,
  },
  inlineAddBtn: {
    minWidth: 44,
    minHeight: 40,
    backgroundColor: colors.accent,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  inlineAddText: { color: colors.background, fontSize: 12, fontWeight: '800' },
  checkRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkRow: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
  },
  checkInner: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { color: colors.text, fontSize: 15, flex: 1 },
  checkLabelDone: { color: colors.textSecondary },
  deleteItemBtn: {
    width: 38,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    maxHeight: '85%',
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
  fullCommentCard: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  fullCommentAuthor: { color: colors.accentSoft, fontSize: 12, fontWeight: '800' },
  fullCommentText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  fullReplyBox: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 4,
    gap: 2,
  },
  fullReplyAuthor: { color: colors.ice, fontSize: 11, fontWeight: '800' },
  accidentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  accidentCopy: { flex: 1, gap: 2 },
  accidentTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  accidentSub: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.75 },
});