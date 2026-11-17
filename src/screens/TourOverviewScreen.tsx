import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  MessageSquare,
  Mountain,
  Navigation,
  Phone,
  Plus,
  Trash2,
  Users,
  Wind,
  X,
} from 'lucide-react-native';

import { TripReportModal } from '../components/TripReportModal';
import { WeatherIcon } from '../components/WeatherIcon';
import { useActiveTour } from '../context/ActiveTourContext';
import { matchContactsForTour } from '../data/contacts';
import {
  getRouteById,
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
} from '../data/routes';
import { useChecklist } from '../hooks/useChecklist';
import { useDualForecast } from '../hooks/useDualForecast';
import { useRoster } from '../hooks/useRoster';
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
  exposureRisk,
  metersPerSecondToKmh,
  tromsoDaylight,
  windCardinal,
} from '../utils/environmental';
import { formatClock, formatTemperature, osloDateKey } from '../utils/format';

export type ScheduleStackParamList = {
  ScheduleHome: undefined;
  TourOverview: undefined;
  DetailedWeather: undefined;
  Tracking: undefined;
};

type NavProp = NativeStackNavigationProp<ScheduleStackParamList, 'TourOverview'>;

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

function pickForecastForTourWindow(
  hourly: HourlyForecastItem[] | undefined,
  dateKey: string,
  startMin: number | null,
  endMin: number | null
): HourlyForecastItem | null {
  if (!hourly || hourly.length === 0) return null;
  if (startMin === null) return hourly[0] ?? null;

  const end = endMin ?? startMin + 180;
  const mid = Math.round((startMin + end) / 2);

  let best: HourlyForecastItem | null = null;
  let bestDiff = Infinity;

  for (const item of hourly) {
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime()) || osloDateKey(d) !== dateKey) continue;
    const m = getOsloMinutes(d);
    const diff = Math.abs(m - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }

  return best ?? hourly[0] ?? null;
}

function peakBridgeGustInWindow(
  hourly: HourlyForecastItem[] | undefined,
  dateKey: string,
  startMin: number | null,
  endMin: number | null
): { maxGustMs: number; peakTime: string } | null {
  if (!hourly || hourly.length === 0) return null;

  const winStart = startMin !== null ? startMin - 60 : 0;
  const winEnd = endMin !== null ? endMin + 60 : 24 * 60;

  let maxGustMs = 0;
  let peakTime = '';

  for (const item of hourly) {
    const d = new Date(item.time);
    if (Number.isNaN(d.getTime()) || osloDateKey(d) !== dateKey) continue;
    const m = getOsloMinutes(d);
    if (m < winStart || m > winEnd) continue;
    const gust = item.windGustMs > 0 ? item.windGustMs : item.windSpeedMs;
    if (gust > maxGustMs) {
      maxGustMs = gust;
      peakTime = formatClock(d);
    }
  }

  return maxGustMs > 0 ? { maxGustMs, peakTime } : null;
}

export function TourOverviewScreen() {
  const navigation = useNavigation<NavProp>();
  const {
    profile,
    activeAssignment,
    activeRoute,
    selectedDate,
    tourKey,
    managerNotes,
    submittedReports,
    dismissNote,
    refreshReports,
    setHillHikeMountain,
    selectManualRoute,
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
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const [editingKit, setEditingKit] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [creatingKit, setCreatingKit] = useState(false);
  const [newKitName, setNewKitName] = useState('');

  useEffect(() => {
    let active = true;
    void fetchWeatherAlerts(activeRoute.weatherPoint).then((items) => {
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

  const bottomWeather = useMemo(
    () => pickForecastForTourWindow(dualForecast.bottom?.hourly, dateKey, startMin, endMin),
    [dualForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const topWeather = useMemo(
    () => pickForecastForTourWindow(dualForecast.top?.hourly, dateKey, startMin, endMin),
    [dualForecast.top?.hourly, dateKey, startMin, endMin]
  );

  const tverrTopWindow = useMemo(
    () => pickForecastForTourWindow(tverrTopForecast.bottom?.hourly, dateKey, startMin, endMin),
    [tverrTopForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const rundTopWindow = useMemo(
    () => pickForecastForTourWindow(rundTopForecast.bottom?.hourly, dateKey, startMin, endMin),
    [rundTopForecast.bottom?.hourly, dateKey, startMin, endMin]
  );

  const bridgePeak = useMemo(() => {
    if (!activeRoute.usesBridgeWarning) return null;
    return peakBridgeGustInWindow(bridgeForecast.bottom?.hourly, dateKey, startMin, endMin);
  }, [activeRoute.usesBridgeWarning, bridgeForecast.bottom?.hourly, dateKey, startMin, endMin]);

  const bridgeAlert =
    bridgePeak !== null && bridgePeak.maxGustMs >= SANDNESSUNDBRUA_GUST_WARNING_MS;

  const primaryWeather = topWeather ?? bottomWeather;
  const feltChill = primaryWeather
    ? calculateWindChill(
        primaryWeather.airTemperatureC,
        metersPerSecondToKmh(primaryWeather.windSpeedMs)
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

  const transportLabel = activeAssignment
    ? [activeAssignment.vehicle, activeAssignment.shipName].filter(Boolean).join(' · ') ||
      'Check dispatch'
    : activeRoute.driveMinutesEachWay === 0
      ? 'Starts at Shop'
      : 'Vehicle TBD';

  const expectedPax = activeAssignment?.guestCount ?? 0;
  const currentRosterPax = roster.totalGuestsCount;

  const dialPhone = async (phone: string) => {
    const cleaned = phone.replace(/\s+/g, '');
    try {
      await Linking.openURL(`tel:${cleaned}`);
    } catch {
      Alert.alert('Call Failed', `Dial ${phone} manually.`);
    }
  };

  const openRosterTab = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('Roster' as never);
    }
  };

  const openBridgeWeather = () => {
    selectManualRoute('sandnessundbrua');
    navigation.navigate('DetailedWeather');
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

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      {/* 1. Manager's Noticeboard */}
      {managerNotes.map((mn) => (
        <View
          key={mn.id}
          style={[
            styles.managerNoteCard,
            mn.level === 'critical' && styles.managerNoteCritical,
            mn.level === 'warning' && styles.managerNoteWarning,
            mn.level === 'info' && styles.managerNoteInfo,
          ]}
        >
          <View style={styles.managerNoteBody}>
            <Text style={styles.managerNoteLevel}>
              MANAGER {mn.level.toUpperCase()}
            </Text>
            <Text style={styles.managerNoteText}>{mn.note}</Text>
          </View>
          {mn.level !== 'critical' ? (
            <Pressable
              hitSlop={10}
              onPress={() => void dismissNote(mn.id)}
              style={styles.dismissBtn}
            >
              <X color={colors.textSecondary} size={18} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {/* 2. Tour Briefing Card */}
      <View style={styles.briefCard}>
        <View style={styles.briefTopRow}>
          <Text style={styles.categoryTag}>
            {activeAssignment?.isCharter ? 'CHARTER' : activeRoute.area.toUpperCase()}
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
          <View style={styles.infoChip}>
            <Bus color={colors.accent} size={16} />
            <Text style={styles.infoChipText}>{transportLabel}</Text>
          </View>
          {concreteReturnClock ? (
            <View style={styles.infoChip}>
              <Clock color={colors.accent} size={16} />
              <Text style={styles.infoChipText}>Back at car {concreteReturnClock}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.returnNote}>{activeRoute.returnNote}</Text>

        {activeAssignment?.cellNote ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteLabel}>NOTE</Text>
            <Text style={styles.noteText}>{activeAssignment.cellNote}</Text>
          </View>
        ) : null}

        {activeAssignment && activeAssignment.commentsList.length > 0 ? (
          <View style={styles.noteBox}>
            <View style={styles.commentHeader}>
              <MessageSquare color={colors.accent} size={14} />
              <Text style={styles.noteLabel}>OFFICE COMMENTS</Text>
            </View>
            {activeAssignment.commentsList.map((c, idx) => (
              <Text key={idx} style={styles.noteText} numberOfLines={4}>
                <Text style={{ fontWeight: '800' }}>{c.author}: </Text>
                {c.content}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {/* 3. Auto-Pinned Ship & Tour Contacts */}
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

      {/* 4. Post-Trip Report Button */}
      {activeAssignment ? (
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
                  : `Submitted (${reportRecord.attendedPax} joined) · Tap to resubmit`
                : 'Pre-filled with guide, tour, date & attended pax'}
            </Text>
          </View>
          <ChevronRight
            color={!reportRecord && tourEnded ? colors.background : colors.textSecondary}
            size={20}
          />
        </Pressable>
      ) : null}

      {/* 5. Morning Mountain Picker (Hill Hikes Only) */}
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
                {tverrTopWindow
                  ? `${tverrTopWindow.windSpeedMs.toFixed(1)} m/s ${
                      tverrTopWindow.windFromDirectionDeg !== null
                        ? windCardinal(tverrTopWindow.windFromDirectionDeg)
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
                {rundTopWindow
                  ? `${rundTopWindow.windSpeedMs.toFixed(1)} m/s ${
                      rundTopWindow.windFromDirectionDeg !== null
                        ? windCardinal(rundTopWindow.windFromDirectionDeg)
                        : ''
                    } · 30m drive`
                  : '30m drive'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 6. Avalanche Level & MetAlerts & Bridge */}
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

      {weatherAlerts.map((alert) => (
        <View key={alert.id} style={styles.metAlertCard}>
          <AlertTriangle color={colors.warning} size={20} />
          <View style={styles.bridgeCopy}>
            <Text style={styles.metAlertTitle}>
              {alert.event} ({alert.severity})
            </Text>
            <Text style={styles.bridgeDetail} numberOfLines={2}>
              {alert.headline}
            </Text>
          </View>
        </View>
      ))}

      {bridgeAlert && bridgePeak ? (
        <Pressable
          onPress={openBridgeWeather}
          style={({ pressed }) => [styles.bridgeAlert, pressed && styles.pressed]}
        >
          <AlertTriangle color={colors.danger} size={22} />
          <View style={styles.bridgeCopy}>
            <Text style={styles.bridgeTitle}>
              Kvaløya Bridge Gusts {Math.round(bridgePeak.maxGustMs)} m/s ({bridgePeak.peakTime})
            </Text>
            <Text style={styles.bridgeDetail}>
              Tap to view detailed Sandnessundbrua bridge forecast →
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 7. Guests & Basic Weather Quick Tiles */}
      <View style={styles.tilesRow}>
        <Pressable
          onPress={openRosterTab}
          style={({ pressed }) => [touchTarget, styles.actionTile, pressed && styles.pressed]}
        >
          <View style={styles.tileHeader}>
            <Users color={colors.accent} size={20} />
            <ChevronRight color={colors.textSecondary} size={18} />
          </View>
          <Text style={styles.tileBigValue}>
            {expectedPax > 0 ? `${expectedPax} pax` : `${currentRosterPax} saved`}
          </Text>
          <Text style={styles.tileSub}>
            {expectedPax > 0
              ? `${currentRosterPax}/${expectedPax} on roster`
              : 'Tap to open Roster'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('DetailedWeather')}
          style={({ pressed }) => [touchTarget, styles.actionTile, pressed && styles.pressed]}
        >
          <View style={styles.tileHeader}>
            {primaryWeather ? (
              <WeatherIcon symbolCode={primaryWeather.symbolCode} size={24} />
            ) : (
              <Wind color={colors.ice} size={20} />
            )}
            <ChevronRight color={colors.textSecondary} size={18} />
          </View>
          {dualForecast.loading && !primaryWeather ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Text style={styles.tileBigValue}>
                {primaryWeather ? formatTemperature(primaryWeather.airTemperatureC) : '—'}
              </Text>
              <Text style={styles.tileSub} numberOfLines={2}>
                {primaryWeather
                  ? `Wind ${primaryWeather.windSpeedMs.toFixed(1)} m/s ${
                      primaryWeather.windFromDirectionDeg !== null
                        ? windCardinal(primaryWeather.windFromDirectionDeg)
                        : ''
                    } · Detailed`
                  : 'Detailed Weather'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* 8. Basic Weather Breakdown Strip */}
      <Pressable
        onPress={() => navigation.navigate('DetailedWeather')}
        style={({ pressed }) => [sharedStyles.card, styles.weatherStrip, pressed && styles.pressed]}
      >
        <View style={styles.weatherStripTop}>
          <Text style={styles.sectionMiniLabel}>TOUR WINDOW WEATHER</Text>
          <Text style={styles.linkText}>Full Forecast →</Text>
        </View>

        {activeRoute.summit ? (
          <View style={styles.dualMiniRow}>
            <View style={styles.dualMiniCol}>
              <Text style={styles.dualMiniTitle}>
                Bottom ({activeRoute.trailhead.elevationMeters}m)
              </Text>
              <Text style={styles.dualMiniVal}>
                {bottomWeather ? formatTemperature(bottomWeather.airTemperatureC) : '—'} ·{' '}
                {bottomWeather ? `${bottomWeather.windSpeedMs.toFixed(1)} m/s` : '—'}
              </Text>
            </View>
            <View style={styles.dualMiniCol}>
              <Text style={styles.dualMiniTitle}>
                Top ({activeRoute.summit.elevationMeters}m)
              </Text>
              <Text style={styles.dualMiniVal}>
                {topWeather ? formatTemperature(topWeather.airTemperatureC) : '—'} ·{' '}
                {topWeather ? `${topWeather.windSpeedMs.toFixed(1)} m/s` : '—'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.singleWeatherLine}>
            {bottomWeather
              ? `${formatTemperature(bottomWeather.airTemperatureC)} · Wind ${bottomWeather.windSpeedMs.toFixed(1)} m/s`
              : 'Loading forecast…'}
          </Text>
        )}

        <View style={styles.weatherStripFooter}>
          {risk && feltChill !== null ? (
            <Text style={[styles.feltPill, { color: risk.color }]}>
              Felt {formatTemperature(feltChill)} · {risk.label}
            </Text>
          ) : null}
          <Text style={styles.daylightMini}>
            Dusk {formatClock(daylight.clocks.civilDusk)}
          </Text>
        </View>
      </Pressable>

      {/* 9. GPS Tracking Button */}
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

      {/* 10. Custom & Editable Equipment Checklist */}
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
                  {checked ? <Check color={colors.background} size={22} strokeWidth={3} /> : null}
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
                <Trash2 color={colors.danger} size={18} />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {/* Post-Trip Report Modal */}
      {activeAssignment ? (
        <TripReportModal
          visible={showReportModal}
          tourKey={tourKey}
          dateIso={dateKey}
          guideName={profile.fullName}
          tripName={activeAssignment.tourName}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  managerNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  managerNoteCritical: { backgroundColor: '#450A0A', borderColor: colors.danger },
  managerNoteWarning: { backgroundColor: '#451A03', borderColor: colors.warning },
  managerNoteInfo: { backgroundColor: '#082F49', borderColor: colors.ice },
  managerNoteBody: { flex: 1, gap: 2 },
  managerNoteLevel: { color: colors.textSecondary, fontSize: 10, fontWeight: '900' },
  managerNoteText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  dismissBtn: { padding: 4 },
  briefCard: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  briefTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTag: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  timePill: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timePillText: { color: colors.accentSoft, fontSize: 13, fontWeight: '800' },
  tourTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  infoChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  returnNote: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  noteBox: {
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteLabel: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  noteText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  contactsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  contactsHeader: { color: colors.ice, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contactInfo: { flex: 1 },
  contactName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  contactPhone: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  contactButtons: { flexDirection: 'row', gap: 6 },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  callPillText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  callPillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  callPillSecondaryText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  reportBtn: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  reportBtnDefault: { backgroundColor: colors.surface, borderColor: colors.accent },
  reportBtnNeeded: { backgroundColor: colors.warning, borderColor: colors.warning },
  reportBtnDone: { backgroundColor: '#022C22', borderColor: colors.success },
  reportCopy: { flex: 1 },
  reportTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  reportSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  mountainPickerCard: { gap: 10, padding: 14 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  pickerRow: { flexDirection: 'row', gap: 8 },
  mountainOption: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  mountainOptionActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  mountainName: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  mountainWind: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  mountainTextActive: { color: colors.background },
  avalancheCard: { borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 4 },
  avalancheTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avalancheLevel: { fontSize: 14, fontWeight: '900' },
  avalancheHeight: { color: colors.text, fontSize: 12, fontWeight: '800' },
  avalancheProblems: { color: colors.text, fontSize: 12, fontWeight: '700' },
  avalancheMain: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  metAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#451A03',
    borderColor: colors.warning,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
  },
  metAlertTitle: { color: colors.warning, fontSize: 14, fontWeight: '800' },
  bridgeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#450A0A',
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
  },
  bridgeCopy: { flex: 1, gap: 2 },
  bridgeTitle: { color: '#FCA5A5', fontSize: 15, fontWeight: '800' },
  bridgeDetail: { color: colors.text, fontSize: 13, lineHeight: 18 },
  tilesRow: { flexDirection: 'row', gap: 10 },
  actionTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 108,
    gap: 6,
  },
  tileHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tileBigValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  tileSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  weatherStrip: { gap: 8 },
  weatherStripTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionMiniLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  dualMiniRow: { flexDirection: 'row', gap: 10 },
  dualMiniCol: {
    flex: 1,
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  dualMiniTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  dualMiniVal: { color: colors.text, fontSize: 15, fontWeight: '800' },
  singleWeatherLine: { color: colors.text, fontSize: 16, fontWeight: '800' },
  weatherStripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feltPill: { fontSize: 12, fontWeight: '800' },
  daylightMini: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  trackingBtn: {
    flexDirection: 'row',
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  trackingBtnCopy: { flex: 1 },
  trackingBtnTitle: { color: colors.background, fontSize: 17, fontWeight: '800' },
  trackingBtnSub: { color: colors.background, fontSize: 12, fontWeight: '700', opacity: 0.85 },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  checklistActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checklistCount: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  editKitBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editKitText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  kitManagerBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  kitManagerLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  kitPillsRow: { gap: 6 },
  kitPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
  },
  kitPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  kitPillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  kitPillTextActive: { color: colors.background, fontWeight: '800' },
  kitPillAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  kitPillAddText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  inlineInputRow: { flexDirection: 'row', gap: 8 },
  inlineInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 14,
  },
  inlineAddBtn: {
    minWidth: 52,
    minHeight: 44,
    backgroundColor: colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  inlineAddText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  checkRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkRow: {
    flex: 1,
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
  checkLabel: { color: colors.text, fontSize: 17, flex: 1 },
  checkLabelDone: { color: colors.textSecondary },
  deleteItemBtn: {
    width: 44,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
});