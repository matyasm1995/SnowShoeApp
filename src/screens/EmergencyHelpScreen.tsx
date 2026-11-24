import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ExternalLink, FileWarning, MapPin, Phone, RefreshCw, ShieldAlert } from 'lucide-react-native';

import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useTracking } from '../context/TrackingContext';
import { ASSIST_STEPS, CORE_CONTACTS } from '../data/contacts';
import { colors, sharedStyles, touchTarget } from '../theme';

function formatDecimal(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}

function toDegreesMinutesSeconds(val: number, posHemi: string, negHemi: string): string {
  const hemi = val >= 0 ? posHemi : negHemi;
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}° ${String(min).padStart(2, '0')}' ${sec.toFixed(1)}" ${hemi}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Location request timed out.')), ms);
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

export function EmergencyHelpScreen() {
  const { activeRoute, activeAssignment } = useActiveTour();
  const { trackedRoute } = useTracking();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{
    lat: number;
    lon: number;
    altM: number | null;
    accuracyM: number | null;
    updatedAt: Date;
  } | null>(null);

  const mountedRef = useRef(true);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const requestIdRef = useRef(0);

  const applyLocation = useCallback((loc: Location.LocationObject) => {
    if (!mountedRef.current) return;
    setCoords({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      altM:
        loc.coords.altitude !== null
          ? Math.round(loc.coords.altitude - 32)
          : null,
      accuracyM:
        loc.coords.accuracy !== null ? Math.round(loc.coords.accuracy) : null,
      updatedAt: new Date(loc.timestamp ?? Date.now()),
    });
    setError(null);
  }, []);

  const stopWatcher = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  }, []);

  const fetchPosition = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (mountedRef.current && reqId === requestIdRef.current) {
          setError('Device GPS / Location Services are turned off. Enable Location in Android settings.');
          setLoading(false);
        }
        return;
      }

      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        if (mountedRef.current && reqId === requestIdRef.current) {
          setError('Location permission denied. Enable GPS in Android Settings.');
          setLoading(false);
        }
        return;
      }

      stopWatcher();

      let gotLiveFix = false;
      let hasAnyFix = false;

      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last && mountedRef.current && reqId === requestIdRef.current) {
          hasAnyFix = true;
          applyLocation(last);
        }
      } catch {}

      try {
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 3,
          },
          (loc) => {
            if (!mountedRef.current || reqId !== requestIdRef.current) return;
            gotLiveFix = true;
            hasAnyFix = true;
            applyLocation(loc);
            setLoading(false);
          }
        );
      } catch {}

      if (!gotLiveFix) {
        try {
          const fresh = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            8000
          );
          if (mountedRef.current && reqId === requestIdRef.current && !gotLiveFix) {
            hasAnyFix = true;
            applyLocation(fresh);
          }
        } catch {
          if (!gotLiveFix) {
            try {
              const balanced = await withTimeout(
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                6000
              );
              if (mountedRef.current && reqId === requestIdRef.current && !gotLiveFix) {
                hasAnyFix = true;
                applyLocation(balanced);
              }
            } catch (err) {
              if (mountedRef.current && reqId === requestIdRef.current && !hasAnyFix) {
                const detail = err instanceof Error ? err.message : '';
                setError(
                  detail
                    ? `Could not get live GPS fix (${detail}). Move to open sky and tap Refresh.`
                    : 'Could not get live GPS fix. Move to open sky and tap Refresh.'
                );
              }
            }
          }
        }
      }
    } catch (err) {
      if (mountedRef.current && reqId === requestIdRef.current) {
        const detail = err instanceof Error ? err.message : 'Unable to read GPS.';
        setError(detail);
      }
    } finally {
      if (mountedRef.current && reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [applyLocation, stopWatcher]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchPosition();
    return () => {
      mountedRef.current = false;
      stopWatcher();
    };
  }, [fetchPosition, stopWatcher]);

  const dial = async (phone: string) => {
    const cleaned = phone.replace(/\s+/g, '');
    try {
      await Linking.openURL(`tel:${cleaned}`);
    } catch {
      Alert.alert('Dial Failed', `Dial ${phone} manually on your phone.`);
    }
  };

  const openHjelp113 = async () => {
    try {
      const supported = await Linking.canOpenURL(CONFIG.links.hjelp113AppUri);
      if (supported) {
        await Linking.openURL(CONFIG.links.hjelp113AppUri);
        return;
      }
    } catch {}
    await dial('113');
  };

  const contextRoute = trackedRoute ?? (activeAssignment ? activeRoute : null);

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      {/* 1. Live GPS Position */}
      <View style={styles.coordCard}>
        <View style={styles.coordTop}>
          <MapPin color={colors.danger} size={22} />
          <Text style={styles.coordHeading}>YOUR GPS POSITION FOR 113</Text>
          {loading ? <ActivityIndicator color={colors.danger} size="small" /> : null}
        </View>

        {coords ? (
          <View style={styles.coordBody}>
            <Text style={styles.coordBig} selectable>
              {formatDecimal(coords.lat, coords.lon)}
            </Text>
            <Text style={styles.coordDms} selectable>
              {toDegreesMinutesSeconds(coords.lat, 'N', 'S')} ·{' '}
              {toDegreesMinutesSeconds(coords.lon, 'E', 'W')}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Text style={styles.metaLabel}>ALTITUDE</Text>
                <Text style={styles.metaValue}>
                  {coords.altM !== null ? `~${coords.altM} m` : '—'}
                </Text>
              </View>
              <View style={styles.metaPill}>
                <Text style={styles.metaLabel}>ACCURACY</Text>
                <Text style={styles.metaValue}>
                  {coords.accuracyM !== null ? `±${coords.accuracyM} m` : '—'}
                </Text>
              </View>
            </View>
            <Text style={styles.updatedText}>
              Updated{' '}
              {coords.updatedAt.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </Text>
          </View>
        ) : (
          <Text style={styles.waitingText}>
            {loading ? 'Reading GPS satellites…' : 'No GPS coordinates yet.'}
          </Text>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={() => void fetchPosition()}
          disabled={loading}
          style={({ pressed }) => [touchTarget, styles.refreshBtn, pressed && styles.pressed]}
        >
          <RefreshCw color={colors.text} size={18} />
          <Text style={styles.refreshBtnText}>Refresh GPS Coordinates</Text>
        </Pressable>
      </View>

      {/* 2. Active Area Context (only shown when on a tour or live tracking) */}
      {contextRoute ? (
        <View style={sharedStyles.card}>
          <Text style={styles.contextLabel}>ACTIVE AREA / TOUR</Text>
          <Text style={styles.contextTitle}>{contextRoute.name}</Text>
          <Text style={styles.contextSub}>
            Area: {contextRoute.area}
            {activeAssignment ? ` · ${activeAssignment.guestCount} guests` : ''}
          </Text>
        </View>
      ) : null}

      {/* 3. Call 113 & Hjelp 113 */}
      <Pressable
        accessibilityRole="button"
        onPress={() => void dial('113')}
        style={({ pressed }) => [touchTarget, styles.callBtn, pressed && styles.pressed]}
      >
        <Phone color={colors.text} size={26} />
        <View style={styles.callCopy}>
          <Text style={styles.callTitle}>Call 113</Text>
          <Text style={styles.callSub}>Norwegian Medical Emergency</Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => void openHjelp113()}
        style={({ pressed }) => [touchTarget, styles.appBtn, pressed && styles.pressed]}
      >
        <ShieldAlert color={colors.text} size={22} />
        <Text style={styles.appBtnText}>Open Official Hjelp 113 App</Text>
      </Pressable>

      {/* 4. ASSIST Accident Protocol */}
      <Text style={sharedStyles.sectionTitle}>In Case of Accident (ASSIST)</Text>
      <View style={sharedStyles.card}>
        <View style={styles.assistList}>
          {ASSIST_STEPS.map((step, idx) => (
            <View key={`${step.letter}-${idx}`} style={styles.assistRow}>
              <View style={styles.assistBadge}>
                <Text style={styles.assistLetter}>{step.letter}</Text>
              </View>
              <View style={styles.assistCopy}>
                <Text style={styles.assistTitle}>{step.title}</Text>
                <Text style={styles.assistDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openURL(CONFIG.links.accidentReportForm)}
        style={({ pressed }) => [touchTarget, styles.accidentFormBtn, pressed && styles.pressed]}
      >
        <FileWarning color={colors.warning} size={22} />
        <View style={styles.accidentFormCopy}>
          <Text style={styles.accidentFormTitle}>Accident / Incident Report Form</Text>
          <Text style={styles.accidentFormSub}>
            Fill out after the trip if an accident or incident occurred
          </Text>
        </View>
        <ExternalLink color={colors.warning} size={18} />
      </Pressable>

      {/* 5. Important Company, Towing, Taxi & Emergency Contacts */}
      <Text style={sharedStyles.sectionTitle}>Key Numbers (Offline)</Text>
      <View style={styles.contactsList}>
        {CORE_CONTACTS.map((c) => (
          <View key={c.id} style={styles.contactCard}>
            <View style={styles.contactCopy}>
              <Text style={styles.contactName}>{c.name}</Text>
              <Text style={styles.contactSub}>
                {c.phone}
                {c.notes ? ` · ${c.notes}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => void dial(c.phone)}
              style={({ pressed }) => [touchTarget, styles.dialBtn, pressed && styles.pressed]}
            >
              <Phone color={colors.background} size={18} />
              <Text style={styles.dialBtnText}>Call</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  coordCard: {
    backgroundColor: '#1C0909',
    borderColor: colors.danger,
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  coordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coordHeading: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    flex: 1,
  },
  coordBody: { gap: 6 },
  coordBig: { color: colors.text, fontSize: 22, fontWeight: '900' },
  coordDms: { color: '#FECACA', fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  metaPill: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  metaLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  metaValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
  updatedText: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  waitingText: { color: colors.textSecondary, fontSize: 15 },
  errorText: { color: '#FCA5A5', fontSize: 13, fontWeight: '700' },
  refreshBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  refreshBtnText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  contextLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  contextTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  contextSub: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
  callBtn: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  callCopy: { flex: 1 },
  callTitle: { color: colors.text, fontSize: 24, fontWeight: '900' },
  callSub: { color: '#FEE2E2', fontSize: 14, fontWeight: '600' },
  appBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  appBtnText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  assistList: { gap: 10 },
  assistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  assistBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistLetter: { color: colors.accentSoft, fontSize: 14, fontWeight: '900' },
  assistCopy: { flex: 1, gap: 1 },
  assistTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  assistDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  contactsList: { gap: 8 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  contactCopy: { flex: 1, gap: 2 },
  contactName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  contactSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  dialBtn: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  dialBtnText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  accidentFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accidentFormCopy: { flex: 1, gap: 2 },
  accidentFormTitle: { color: colors.warning, fontSize: 15, fontWeight: '800' },
  accidentFormSub: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.78 },
});