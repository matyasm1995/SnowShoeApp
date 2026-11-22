import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Crosshair,
  MapPin,
  Mountain,
  Pencil,
  Plus,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';

import { WeatherAlertModal } from '../components/WeatherAlertModal';
import { WeatherIcon } from '../components/WeatherIcon';
import { WindCompass } from '../components/WindCompass';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import type { ElevationMode } from '../data/locations';
import {
  SANDNESSUNDBRUA_GUST_WARNING_MS,
  SANDNESSUNDBRUA_POINT,
} from '../data/routes';
import {
  BUILTIN_WEATHER_SPOTS,
  isValidLatLon,
  loadCustomWeatherSpots,
  parseCoordinatesInput,
  routeIdToWeatherSpotId,
  saveCustomWeatherSpots,
  type WeatherSpot,
} from '../data/weatherSpots';
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
  isItemOverlappingWindow,
  summarizeForecastWindow,
  type HourlyForecastItem,
} from '../services/weatherService';
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

const HOUR_CARD_WIDTH = 88;
const HOUR_CARD_GAP = 8;
const HOUR_CARD_STRIDE = HOUR_CARD_WIDTH + HOUR_CARD_GAP;

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GPS request timed out.')), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function WeatherScreen() {
  const route = useRoute();
  const paramSpotId = (route.params as { spotId?: string } | undefined)?.spotId;

  const { activeAssignment, activeRoute, selectedDate } = useActiveTour();

  const [customSpots, setCustomSpots] = useState<WeatherSpot[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string>(
    () => paramSpotId ?? routeIdToWeatherSpotId(activeRoute.id)
  );
  const [elevation, setElevation] = useState<ElevationMode>('trailhead');
  const [selectedTimeIndex, setSelectedTimeIndex] = useState<number>(0);
  const [timeSelectionPinned, setTimeSelectionPinned] = useState<boolean>(false);
  const [now, setNow] = useState(() => new Date());
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<WeatherAlertItem | null>(null);
  const [avalanche, setAvalanche] = useState<AvalancheWarning | null>(null);

  // Add/Edit custom weather point modal state
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [editingSpotId, setEditingSpotId] = useState<string | null>(null);
  const [spotNameInput, setSpotNameInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [eleInput, setEleInput] = useState('');
  const [spotFormError, setSpotFormError] = useState<string | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const timelineScrollRef = useRef<ScrollView>(null);
  const pendingScrollIdxRef = useRef<number | null>(null);
  const timelineContentWidthRef = useRef<number>(0);

  const scrollToCardIndex = useCallback((idx: number, animated: boolean) => {
    const scrollX = Math.max(0, idx * HOUR_CARD_STRIDE);
    timelineScrollRef.current?.scrollTo({ x: scrollX, animated });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCustomWeatherSpots().then((loaded) => {
        if (active) setCustomSpots(loaded);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    if (paramSpotId) {
      setSelectedSpotId(paramSpotId);
      setTimeSelectionPinned(false);
    }
  }, [paramSpotId]);

  useEffect(() => {
    if (!paramSpotId) {
      setSelectedSpotId(routeIdToWeatherSpotId(activeRoute.id));
      setTimeSelectionPinned(false);
    }
  }, [activeRoute.id, paramSpotId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CONFIG.weather.refreshIntervalMs);
    return () => clearInterval(timer);
  }, []);

  const allSpots = useMemo<WeatherSpot[]>(
    () => [...BUILTIN_WEATHER_SPOTS, ...customSpots],
    [customSpots]
  );

  const activeSpot: WeatherSpot = useMemo(
    () => allSpots.find((s) => s.id === selectedSpotId) ?? BUILTIN_WEATHER_SPOTS[0]!,
    [allSpots, selectedSpotId]
  );

  useEffect(() => {
    setTimeSelectionPinned(false);
    if (!activeSpot.summit) {
      setElevation('trailhead');
    }
  }, [activeSpot.id, activeSpot.summit, activeAssignment?.tourName]);

  useEffect(() => {
    let active = true;
    void fetchWeatherAlerts(activeSpot.point, selectedDate).then((items) => {
      if (active) setWeatherAlerts(items);
    });
    if (activeSpot.showAvalanche) {
      void fetchTromsoAvalanche(selectedDate).then((av) => {
        if (active) setAvalanche(av);
      });
    } else {
      setAvalanche(null);
    }
    return () => {
      active = false;
    };
  }, [activeSpot.point, activeSpot.showAvalanche, selectedDate]);

  const effectiveElevation: ElevationMode = activeSpot.summit ? elevation : 'trailhead';
  const dualForecast = useDualForecast(activeSpot.point, activeSpot.summit);
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

  const dateOutsideForecast = useMemo(() => {
    if (hourlyList.length === 0 || targetDateKey === todayKey) return false;
    return !hourlyList.some((item) => {
      const d = new Date(item.time);
      return !Number.isNaN(d.getTime()) && osloDateKey(d) === targetDateKey;
    });
  }, [hourlyList, targetDateKey, todayKey]);

  // Auto-scroll timeline accurately to tour start (or midday on future selected date)
  useEffect(() => {
    if (timeSelectionPinned || hourlyList.length === 0) return;

    let targetIdx = 0;

    if (tourStartMinutes !== null && tourEndMinutes !== null) {
      const idx = hourlyList.findIndex((item) =>
        isItemOverlappingWindow(item, targetDateKey, tourStartMinutes, tourEndMinutes)
      );
      if (idx !== -1) {
        targetIdx = idx;
      } else if (targetDateKey > todayKey) {
        const dayIdx = hourlyList.findIndex((item) => {
          const d = new Date(item.time);
          return !Number.isNaN(d.getTime()) && osloDateKey(d) === targetDateKey;
        });
        if (dayIdx !== -1) targetIdx = dayIdx;
      }
    } else if (targetDateKey > todayKey) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < hourlyList.length; i++) {
        const item = hourlyList[i];
        if (!item) continue;
        const d = new Date(item.time);
        if (Number.isNaN(d.getTime()) || osloDateKey(d) !== targetDateKey) continue;
        const m = getOsloMinutesOfDay(d);
        const center = m + (item.stepHours === 6 ? 180 : 0);
        const diff = Math.abs(center - 720);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) targetIdx = bestIdx;
    }

    setSelectedTimeIndex(targetIdx);
    pendingScrollIdxRef.current = targetIdx;

    if (timelineContentWidthRef.current > 0) {
      requestAnimationFrame(() => {
        scrollToCardIndex(targetIdx, true);
      });
    }
  }, [
    timeSelectionPinned,
    hourlyList,
    tourStartMinutes,
    tourEndMinutes,
    targetDateKey,
    todayKey,
    scrollToCardIndex,
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

  const bridgeSummary = useMemo(() => {
    if (!activeSpot.usesBridgeWarning) return null;
    return summarizeForecastWindow(
      bridgeForecast.bottom?.hourly,
      targetDateKey,
      tourStartMinutes !== null ? Math.max(0, tourStartMinutes - 60) : null,
      tourEndMinutes !== null ? Math.min(24 * 60, tourEndMinutes + 60) : null
    );
  }, [
    activeSpot.usesBridgeWarning,
    bridgeForecast.bottom?.hourly,
    targetDateKey,
    tourStartMinutes,
    tourEndMinutes,
  ]);

  const bridgeAlert =
    bridgeSummary !== null &&
    bridgeSummary.hasData &&
    bridgeSummary.peakGustMs >= SANDNESSUNDBRUA_GUST_WARNING_MS;

  const resolvedBottomElevation =
    dualForecast.bottom?.point.elevationMeters ?? activeSpot.point.elevationMeters ?? 0;

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

  const daylightDate = useMemo(() => {
    if (activeConditions) {
      const d = new Date(activeConditions.time);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return selectedDate;
  }, [activeConditions, selectedDate]);

  const daylight = useMemo(() => tromsoDaylight(daylightDate), [daylightDate]);

  const snowlineInfo = useMemo(() => {
    const tHead = bottomHourItem?.airTemperatureC ?? activeConditions?.airTemperatureC ?? 0;
    const tSummit = summitHourItem?.airTemperatureC ?? null;
    return estimateSnowlineMeters(
      resolvedBottomElevation,
      tHead,
      activeSpot.summit?.elevationMeters ?? null,
      tSummit
    );
  }, [bottomHourItem, summitHourItem, activeConditions, resolvedBottomElevation, activeSpot.summit]);

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

  const activeTimeLabel = useMemo(() => {
    if (!activeConditions) return 'NOW';
    const d = new Date(activeConditions.time);
    if (Number.isNaN(d.getTime())) return 'NOW';
    const clock = d.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Oslo',
      hour: '2-digit',
      minute: '2-digit',
    });
    const prefix =
      osloDateKey(d) !== todayKey
        ? `${d.toLocaleDateString('en-GB', {
            timeZone: 'Europe/Oslo',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })} `
        : '';
    const stepTag = activeConditions.stepHours === 6 ? ' · 6H' : '';
    return `${prefix}${clock}${stepTag}`.toUpperCase();
  }, [activeConditions, todayKey]);

  const selectedDateShort = useMemo(
    () =>
      selectedDate.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [selectedDate]
  );

  const openAddSpotModal = () => {
    setEditingSpotId(null);
    setSpotNameInput('');
    setPasteInput('');
    setLatInput('');
    setLonInput('');
    setEleInput('');
    setSpotFormError(null);
    setShowSpotModal(true);
  };

  const openEditSpotModal = (spot: WeatherSpot) => {
    setEditingSpotId(spot.id);
    setSpotNameInput(spot.name);
    setPasteInput('');
    setLatInput(spot.point.latitude.toFixed(5));
    setLonInput(spot.point.longitude.toFixed(5));
    setEleInput(
      spot.point.elevationMeters !== undefined && spot.point.elevationMeters !== null
        ? String(Math.round(spot.point.elevationMeters))
        : ''
    );
    setSpotFormError(null);
    setShowSpotModal(true);
  };

  const handlePasteCoordinates = (value: string) => {
    setPasteInput(value);
    const parsed = parseCoordinatesInput(value);
    if (parsed) {
      setLatInput(parsed.latitude.toFixed(5));
      setLonInput(parsed.longitude.toFixed(5));
      setSpotFormError(null);
    }
  };

  const handleUseCurrentGps = async () => {
    setLocatingGps(true);
    setSpotFormError(null);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setSpotFormError('Device GPS / Location Services are turned off.');
        return;
      }

      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        setSpotFormError('Location permission denied. Enter coordinates manually.');
        return;
      }

      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        10000
      );
      setLatInput(pos.coords.latitude.toFixed(5));
      setLonInput(pos.coords.longitude.toFixed(5));
      if (pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude)) {
        const correctedEle = Math.max(0, Math.round(pos.coords.altitude - 32));
        setEleInput(String(correctedEle));
      }
    } catch (err) {
      setSpotFormError(
        err instanceof Error ? err.message : 'Could not read GPS position.'
      );
    } finally {
      setLocatingGps(false);
    }
  };

  const handleSaveCustomSpot = async () => {
    const cleanName = spotNameInput.trim();
    if (!cleanName) {
      setSpotFormError('Enter a name for this weather point.');
      return;
    }

    const lat = Number(latInput.trim().replace(',', '.'));
    const lon = Number(lonInput.trim().replace(',', '.'));
    if (!isValidLatLon(lat, lon)) {
      setSpotFormError('Enter valid latitude (-90..90) and longitude (-180..180).');
      return;
    }

    const eleTrim = eleInput.trim();
    let parsedEle: number | null = null;
    if (eleTrim.length > 0) {
      const num = Number(eleTrim.replace(',', '.'));
      if (!Number.isFinite(num) || num < -100 || num > 5000) {
        setSpotFormError('Elevation must be a valid number in meters (or leave blank).');
        return;
      }
      parsedEle = Math.round(num);
    }

    const spotId = editingSpotId ?? `custom-${Date.now()}`;
    const newSpot: WeatherSpot = {
      id: spotId,
      name: cleanName,
      subtitle: `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`,
      point: {
        latitude: lat,
        longitude: lon,
        elevationMeters: parsedEle,
      },
      summit: null,
      showAvalanche: false,
      usesBridgeWarning: false,
      isCustom: true,
    };

    const nextSpots = editingSpotId
      ? customSpots.map((s) => (s.id === editingSpotId ? newSpot : s))
      : [...customSpots, newSpot];

    await saveCustomWeatherSpots(nextSpots);
    setCustomSpots(nextSpots);
    setSelectedSpotId(spotId);
    setTimeSelectionPinned(false);
    setShowSpotModal(false);
  };

  const confirmDeleteCustomSpot = (spot: WeatherSpot) => {
    Alert.alert(
      'Delete Custom Point',
      `Remove "${spot.name}" from your Weather locations?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const nextSpots = customSpots.filter((s) => s.id !== spot.id);
            void saveCustomWeatherSpots(nextSpots).then(() => {
              setCustomSpots(nextSpots);
              if (selectedSpotId === spot.id) {
                setSelectedSpotId(BUILTIN_WEATHER_SPOTS[0]!.id);
                setTimeSelectionPinned(false);
              }
              setShowSpotModal(false);
            });
          },
        },
      ]
    );
  };

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
            void fetchWeatherAlerts(activeSpot.point, selectedDate).then(setWeatherAlerts);
            if (activeSpot.showAvalanche) {
              void fetchTromsoAvalanche(selectedDate).then(setAvalanche);
            }
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* 1. Curated Weather Locations + Custom Points */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        {allSpots.map((spot) => {
          const selected = spot.id === activeSpot.id;
          return (
            <Pressable
              key={spot.id}
              onPress={() => {
                setSelectedSpotId(spot.id);
                setTimeSelectionPinned(false);
              }}
              onLongPress={spot.isCustom ? () => openEditSpotModal(spot) : undefined}
              style={({ pressed }) => [
                touchTarget,
                styles.pill,
                selected && styles.pillSelected,
                pressed && styles.pressed,
              ]}
            >
              {spot.isCustom ? (
                <MapPin
                  color={selected ? colors.accentSoft : colors.ice}
                  size={13}
                  style={{ marginRight: 4 }}
                />
              ) : null}
              <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
                {spot.name}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={openAddSpotModal}
          style={({ pressed }) => [touchTarget, styles.addPill, pressed && styles.pressed]}
        >
          <Plus color={colors.accent} size={15} />
          <Text style={styles.addPillText}>Add</Text>
        </Pressable>
      </ScrollView>

      {/* Custom Spot Coordinates & Edit/Delete Bar */}
      {activeSpot.isCustom ? (
        <View style={styles.customSpotBar}>
          <View style={styles.customSpotInfo}>
            <MapPin color={colors.ice} size={14} />
            <Text style={styles.customSpotMeta} numberOfLines={1}>
              {activeSpot.point.latitude.toFixed(4)}°N, {activeSpot.point.longitude.toFixed(4)}°E ·{' '}
              {resolvedBottomElevation}m
            </Text>
          </View>
          <View style={styles.customSpotActions}>
            <Pressable
              onPress={() => openEditSpotModal(activeSpot)}
              hitSlop={8}
              style={({ pressed }) => [styles.customActionBtn, pressed && styles.pressed]}
            >
              <Pencil color={colors.textSecondary} size={14} />
              <Text style={styles.customActionText}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => confirmDeleteCustomSpot(activeSpot)}
              hitSlop={8}
              style={({ pressed }) => [styles.customActionBtn, pressed && styles.pressed]}
            >
              <Trash2 color={colors.danger} size={14} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* 2. Active MET / Yr Weather Warnings (Clickable) */}
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
            <AlertTriangle color={palette.color} size={18} />
            <View style={styles.alertCopy}>
              <View style={styles.alertTopRow}>
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

      {/* 3. Avalanche Forecast Card (Hill Hikes Only) */}
      {activeSpot.showAvalanche && avalanche && avColors ? (
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
      {bridgeAlert && bridgeSummary ? (
        <Pressable
          onPress={() => {
            if (activeSpot.id !== 'kvaloya-bridge') {
              setSelectedSpotId('kvaloya-bridge');
              setTimeSelectionPinned(false);
            }
          }}
          style={({ pressed }) => [styles.bridgeAlert, pressed && styles.pressed]}
        >
          <AlertTriangle color={colors.danger} size={22} />
          <View style={styles.alertCopy}>
            <Text style={styles.bridgeTitle}>
              Sandnessundbrua Gusts {Math.round(bridgeSummary.peakGustMs)} m/s (
              {bridgeSummary.peakTime})
            </Text>
            <Text style={styles.bridgeDetail}>
              Exceeds {SANDNESSUNDBRUA_GUST_WARNING_MS} m/s threshold on Kvaløya Bridge.
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* 5. Bottom vs Top Switcher (Hill Hikes) */}
      {activeSpot.summit ? (
        <View style={styles.dualRow}>
          <Pressable
            onPress={() => setElevation('trailhead')}
            style={[
              touchTarget,
              styles.dualCol,
              effectiveElevation === 'trailhead' && styles.dualColSelected,
            ]}
          >
            <Text style={styles.dualLabel}>BOTTOM ({resolvedBottomElevation}m)</Text>
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
              TOP ({activeSpot.summit.elevationMeters}m)
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

      {/* 6. Full 9-Day Scrollable Forecast (48h hourly + 6h outlook) */}
      {hourlyList.length > 0 ? (
        <View style={styles.timelineSection}>
          <View style={styles.timelineHeaderRow}>
            <Text style={styles.timelineHeader} numberOfLines={1}>
              9-DAY FORECAST ({activeTimeLabel})
            </Text>
            {activeAssignment?.startTimeLabel ? (
              <Text style={styles.timelineTourTag}>
                TOUR: {activeAssignment.startTimeLabel}–{activeAssignment.endTimeLabel}
              </Text>
            ) : null}
          </View>

          {dateOutsideForecast ? (
            <View style={styles.rangeNoticeBar}>
              <Text style={styles.rangeNoticeText}>
                Selected date ({selectedDateShort}) is outside the 9-day forecast — showing Now.
              </Text>
            </View>
          ) : null}

          <ScrollView
            ref={timelineScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timelineScroll}
            onContentSizeChange={(w) => {
              timelineContentWidthRef.current = w;
              if (pendingScrollIdxRef.current !== null && w > 0) {
                const idx = pendingScrollIdxRef.current;
                pendingScrollIdxRef.current = null;
                requestAnimationFrame(() => {
                  scrollToCardIndex(idx, false);
                });
              }
            }}
          >
            {hourlyList.map((hourItem, idx) => {
              const isSelected = idx === clampedTimeIndex;
              const inTour =
                tourStartMinutes !== null &&
                tourEndMinutes !== null &&
                isItemOverlappingWindow(hourItem, targetDateKey, tourStartMinutes, tourEndMinutes);
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
              const is6h = hourItem.stepHours === 6;

              return (
                <Pressable
                  key={hourItem.time}
                  onPress={() => {
                    pendingScrollIdxRef.current = null;
                    setSelectedTimeIndex(idx);
                    setTimeSelectionPinned(true);
                  }}
                  style={[
                    styles.hourCard,
                    inTour && styles.hourCardInTour,
                    isSelected && styles.hourCardSelected,
                  ]}
                >
                  {inTour ? (
                    <Text style={styles.hourTourBadge}>TOUR{is6h ? ' · 6H' : ''}</Text>
                  ) : is6h ? (
                    <Text style={styles.hourStepBadge}>6H</Text>
                  ) : null}
                  <Text
                    style={[styles.hourTime, isSelected && styles.hourTimeSelected]}
                    numberOfLines={1}
                  >
                    {dayPrefix ? `${dayPrefix} ${timeString}` : timeString}
                  </Text>
                  <WeatherIcon symbolCode={hourItem.symbolCode} size={26} />
                  <Text style={styles.hourTemp}>{Math.round(hourItem.airTemperatureC)}°</Text>
                  <Text style={styles.hourWind} numberOfLines={1}>
                    {Math.round(hourItem.windSpeedMs)} m/s{' '}
                    {hourItem.windFromDirectionDeg !== null
                      ? windCardinal(hourItem.windFromDirectionDeg)
                      : ''}
                  </Text>
                  {hourItem.precipitationMm > 0 ? (
                    <Text style={styles.hourRainText} numberOfLines={1}>
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
                {effectiveElevation === 'summit' && activeSpot.summit
                  ? `${activeSpot.summit.elevationMeters}m`
                  : `${resolvedBottomElevation}m`}
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

      {/* Add / Edit Custom Weather Point Modal */}
      <Modal
        visible={showSpotModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSpotModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingSpotId ? 'Edit Custom Point' : 'Add Custom Weather Point'}
              </Text>
              <Pressable onPress={() => setShowSpotModal(false)} style={styles.modalClose}>
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>LOCATION NAME</Text>
                <TextInput
                  value={spotNameInput}
                  onChangeText={(v) => {
                    setSpotNameInput(v);
                    setSpotFormError(null);
                  }}
                  placeholder="e.g. Fløya, Ersfjordbotn, Buren"
                  placeholderTextColor={colors.textMuted}
                  style={styles.textInput}
                />
              </View>

              <Pressable
                onPress={() => void handleUseCurrentGps()}
                disabled={locatingGps}
                style={({ pressed }) => [
                  touchTarget,
                  styles.gpsBtn,
                  pressed && styles.pressed,
                ]}
              >
                {locatingGps ? (
                  <ActivityIndicator color={colors.ice} size="small" />
                ) : (
                  <Crosshair color={colors.ice} size={18} />
                )}
                <Text style={styles.gpsBtnText}>
                  {locatingGps ? 'Reading GPS…' : 'Use Current GPS Location'}
                </Text>
              </Pressable>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>QUICK PASTE (COORDS OR GOOGLE MAPS LINK)</Text>
                <TextInput
                  value={pasteInput}
                  onChangeText={handlePasteCoordinates}
                  placeholder="Paste 69.6492, 18.9553 or Maps URL"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
              </View>

              <View style={styles.coordRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>LATITUDE</Text>
                  <TextInput
                    value={latInput}
                    onChangeText={(v) => {
                      setLatInput(v);
                      setSpotFormError(null);
                    }}
                    placeholder="69.6492"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    style={styles.textInput}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>LONGITUDE</Text>
                  <TextInput
                    value={lonInput}
                    onChangeText={(v) => {
                      setLonInput(v);
                      setSpotFormError(null);
                    }}
                    placeholder="18.9553"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    style={styles.textInput}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>ELEVATION IN METERS (OPTIONAL)</Text>
                <TextInput
                  value={eleInput}
                  onChangeText={(v) => {
                    setEleInput(v);
                    setSpotFormError(null);
                  }}
                  placeholder="Leave blank for automatic terrain elevation"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
              </View>

              {spotFormError ? (
                <Text style={styles.formErrorText}>{spotFormError}</Text>
              ) : null}

              <View style={styles.modalActions}>
                {editingSpotId ? (
                  <Pressable
                    onPress={() => {
                      const target = customSpots.find((s) => s.id === editingSpotId);
                      if (target) confirmDeleteCustomSpot(target);
                    }}
                    style={({ pressed }) => [
                      touchTarget,
                      styles.deleteModalBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Trash2 color={colors.danger} size={18} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void handleSaveCustomSpot()}
                  style={({ pressed }) => [
                    touchTarget,
                    styles.saveModalBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.saveModalBtnText}>
                    {editingSpotId ? 'Save Changes' : 'Add Weather Point'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <WeatherAlertModal
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
      />
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
    flexDirection: 'row',
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg },
  pillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  pillTextSelected: { color: colors.accentSoft },
  addPill: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  addPillText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  customSpotBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  customSpotInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  customSpotMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', flex: 1 },
  customSpotActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  customActionText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
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
  alertTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metAlertTitle: { color: colors.warning, fontSize: 13, fontWeight: '800', flex: 1 },
  alertDetailsHint: { fontSize: 11, fontWeight: '800' },
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
    gap: 8,
  },
  timelineHeader: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    flex: 1,
  },
  timelineTourTag: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  rangeNoticeBar: {
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangeNoticeText: { color: colors.ice, fontSize: 11, fontWeight: '700' },
  timelineScroll: { gap: HOUR_CARD_GAP, paddingVertical: 2, paddingHorizontal: 4 },
  hourCard: {
    width: HOUR_CARD_WIDTH,
    minHeight: 112,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  hourCardInTour: { borderColor: colors.accent, backgroundColor: colors.accentDarkBg },
  hourCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDarkBg,
    borderWidth: 1.5,
  },
  hourTourBadge: { color: colors.accentSoft, fontSize: 9, fontWeight: '800' },
  hourStepBadge: { color: colors.ice, fontSize: 9, fontWeight: '800' },
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
    maxHeight: '88%',
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
  modalBody: { padding: 14, gap: 12, paddingBottom: 28 },
  fieldGroup: { gap: 5 },
  fieldLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  textInput: {
    minHeight: 46,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  gpsBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  gpsBtnText: { color: colors.ice, fontSize: 14, fontWeight: '800' },
  coordRow: { flexDirection: 'row', gap: 10 },
  formErrorText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  deleteModalBtn: {
    width: 52,
    borderRadius: 12,
    backgroundColor: colors.dangerDarkBg,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  saveModalBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
  },
  saveModalBtnText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
