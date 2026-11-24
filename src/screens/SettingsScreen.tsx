import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Download,
} from 'lucide-react-native';

import { GuideManualModal } from '../components/GuideManualModal';
import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useTracking } from '../context/TrackingContext';
import {
  applyPendingUpdate,
  checkForUpdateManually,
  getInstalledUpdateInfo,
  subscribeUpdateReady,
} from '../services/appUpdateService';
import {
  getGuideProfile,
  saveGuideProfile,
  type ContractType,
  type GuideProfile,
} from '../services/googleSheetsService';
import {
  isServerPushRegistered,
  registerDeviceForPushDispatch,
} from '../services/notificationService';
import { colors, sharedStyles, touchTarget } from '../theme';

const STORAGE_KEY_PREVIEW_ALERTS = 'pref:preview_alerts_v1';

export function SettingsScreen() {
  const { reloadProfileAndCache } = useActiveTour();
  const { trackingActive } = useTracking();
  const [initials, setInitials] = useState<string>(CONFIG.defaults.guideInitials);
  const [fullName, setFullName] = useState<string>(CONFIG.defaults.guideFullName);
  const [contractType, setContractType] = useState<ContractType>(CONFIG.defaults.contractType);
  const [defaultMountain, setDefaultMountain] = useState<string>(CONFIG.defaults.defaultMountain);
  const [previewAlerts, setPreviewAlerts] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [serverPushActive, setServerPushActive] = useState(false);

  const updateInfo = getInstalledUpdateInfo();

  useEffect(() => subscribeUpdateReady(setUpdateReady), []);

  useEffect(() => {
    void (async () => {
      const [profile, rawPreview, pushReg] = await Promise.all([
        getGuideProfile(),
        AsyncStorage.getItem(STORAGE_KEY_PREVIEW_ALERTS),
        isServerPushRegistered(),
      ]);
      setInitials(profile.initials);
      setFullName(profile.fullName);
      setContractType(profile.contractType);
      setDefaultMountain(profile.defaultMountain);
      setPreviewAlerts(rawPreview === 'true');
      setServerPushActive(pushReg);
    })();
  }, []);

  const togglePreviewAlerts = async (val: boolean) => {
    setPreviewAlerts(val);
    await AsyncStorage.setItem(STORAGE_KEY_PREVIEW_ALERTS, val ? 'true' : 'false');
  };

  const handleSave = async () => {
    const updated: GuideProfile = {
      initials: initials.trim() || CONFIG.defaults.guideInitials,
      fullName: fullName.trim() || CONFIG.defaults.guideFullName,
      contractType,
      defaultMountain,
    };
    await saveGuideProfile(updated);
    await reloadProfileAndCache();
    const ok = await registerDeviceForPushDispatch(updated, true);
    setServerPushActive(ok);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    Alert.alert('Settings Saved', 'Profile preferences updated.');
  };

  const handleCheckUpdate = async () => {
    if (updateReady) {
      if (trackingActive) {
        Alert.alert(
          'GPS Tracking Active',
          'Stop live GPS tracking before restarting to apply the update.'
        );
        return;
      }
      await applyPendingUpdate();
      return;
    }

    setCheckingUpdate(true);
    try {
      const result = await checkForUpdateManually();
      if (result === 'updated') {
        if (trackingActive) {
          Alert.alert(
            'Update Downloaded',
            'Saved and ready. Stop GPS tracking first, then tap Restart to apply.'
          );
        } else {
          Alert.alert(
            'Update Downloaded',
            'A new version of TO Guides is ready. Restart now to apply it?',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Restart Now', onPress: () => void applyPendingUpdate() },
            ]
          );
        }
      } else if (result === 'up_to_date') {
        Alert.alert('Up to Date', 'You already have the latest TO Guides update.');
      } else if (result === 'unavailable') {
        Alert.alert(
          'Updates Unavailable',
          'Over-the-air updates are only active in installed Play Store / EAS builds.'
        );
      } else {
        Alert.alert(
          'Check Failed',
          'Could not check for updates right now. Make sure you are online.'
        );
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <ScrollView style={sharedStyles.screen} contentContainerStyle={sharedStyles.content}>
      <Text style={sharedStyles.sectionTitle}>Guide Profile & Settings</Text>
      <Text style={sharedStyles.secondary}>
        Configure your identity and employment terms. The app uses these to scan the dispatch sheet and determine your days off.
      </Text>

      {/* 1. Identity Card */}
      <View style={[sharedStyles.card, styles.cardGap]}>
        <Text style={styles.cardHeader}>GUIDE IDENTITY</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Initials on Schedule (e.g. Mh, He, To)</Text>
          <TextInput
            value={initials}
            onChangeText={setInitials}
            placeholder="Mh"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
            autoCapitalize="characters"
            maxLength={6}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Full Name on Roster (e.g. Michal, Tomas)</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Michal"
            placeholderTextColor={colors.textSecondary}
            style={styles.textInput}
            autoCapitalize="words"
          />
        </View>
      </View>

      {/* 2. Employment Contract Type */}
      <View style={[sharedStyles.card, styles.cardGap]}>
        <Text style={styles.cardHeader}>EMPLOYMENT TYPE (DAYS-OFF LOGIC)</Text>
        <Text style={styles.caption}>
          Governs how staff columns (BQ–CY) interpret empty cells.
        </Text>

        <View style={styles.toggleGroup}>
          <Pressable
            onPress={() => setContractType('full-time')}
            style={[
              touchTarget,
              styles.contractBtn,
              contractType === 'full-time' && styles.contractBtnActive,
            ]}
          >
            <Building2
              color={contractType === 'full-time' ? colors.background : colors.text}
              size={20}
            />
            <View style={styles.contractTextCol}>
              <Text
                style={[
                  styles.contractTitle,
                  contractType === 'full-time' && styles.contractTextActive,
                ]}
              >
                Full-Time (100%)
              </Text>
              <Text
                style={[
                  styles.contractSub,
                  contractType === 'full-time' && styles.contractTextActive,
                ]}
              >
                Empty = Base Duty · Initials (Mh) = Day Off
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setContractType('part-time')}
            style={[
              touchTarget,
              styles.contractBtn,
              contractType === 'part-time' && styles.contractBtnActive,
            ]}
          >
            <Clock
              color={contractType === 'part-time' ? colors.background : colors.text}
              size={20}
            />
            <View style={styles.contractTextCol}>
              <Text
                style={[
                  styles.contractTitle,
                  contractType === 'part-time' && styles.contractTextActive,
                ]}
              >
                Part-Time (20%)
              </Text>
              <Text
                style={[
                  styles.contractSub,
                  contractType === 'part-time' && styles.contractTextActive,
                ]}
              >
                Empty cell = Day Off
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* 3. Mountain Preference */}
      <View style={[sharedStyles.card, styles.cardGap]}>
        <Text style={styles.cardHeader}>DEFAULT KVALØYA MOUNTAIN</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setDefaultMountain('tverrfjellet')}
            style={[
              touchTarget,
              styles.mountainBtn,
              defaultMountain === 'tverrfjellet' && styles.mountainBtnActive,
            ]}
          >
            <Text
              style={[
                styles.mountainText,
                defaultMountain === 'tverrfjellet' && styles.mountainTextActive,
              ]}
            >
              Tverrfjellet (524m)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDefaultMountain('rundfjellet')}
            style={[
              touchTarget,
              styles.mountainBtn,
              defaultMountain === 'rundfjellet' && styles.mountainBtnActive,
            ]}
          >
            <Text
              style={[
                styles.mountainText,
                defaultMountain === 'rundfjellet' && styles.mountainTextActive,
              ]}
            >
              Rundfjellet (472m)
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 4. Save Button */}
      <Pressable
        onPress={() => void handleSave()}
        style={({ pressed }) => [touchTarget, styles.saveBtn, pressed && styles.pressed]}
      >
        <Check color={colors.background} size={22} strokeWidth={3} />
        <Text style={styles.saveBtnText}>{saved ? 'Preferences Saved!' : 'Save Settings'}</Text>
      </Pressable>

      {/* 5. Preview Warnings Toggle */}
      <View style={[sharedStyles.card, styles.previewRow]}>
        <AlertTriangle color={colors.warning} size={20} />
        <View style={styles.contractTextCol}>
          <Text style={styles.previewTitle}>Preview Warnings & Avalanche</Text>
          <Text style={styles.previewSub}>
            Test how Level 3 Avalanche & MetAlerts look during calm weather
          </Text>
        </View>
        <Switch
          value={previewAlerts}
          onValueChange={(v) => void togglePreviewAlerts(v)}
          trackColor={{ false: '#27272A', true: colors.accent }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* 6. Offline Guide Manual */}
      <Pressable
        onPress={() => setShowManual(true)}
        style={({ pressed }) => [
          sharedStyles.card,
          styles.manualBtn,
          pressed && styles.pressed,
        ]}
      >
        <BookOpen color={colors.accent} size={20} />
        <View style={styles.contractTextCol}>
          <Text style={styles.previewTitle}>Guide Manual & Features</Text>
          <Text style={styles.previewSub}>
            Offline onboarding guide, status colors, GPS pacing & tips
          </Text>
        </View>
        <ChevronRight color={colors.textSecondary} size={20} />
      </Pressable>

      {/* 6b. Check / Apply App Updates */}
      <Pressable
        onPress={() => void handleCheckUpdate()}
        disabled={checkingUpdate}
        style={({ pressed }) => [
          sharedStyles.card,
          styles.manualBtn,
          updateReady && styles.updateReadyCard,
          pressed && styles.pressed,
        ]}
      >
        {checkingUpdate ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Download color={updateReady ? colors.ice : colors.accent} size={20} />
        )}
        <View style={styles.contractTextCol}>
          <Text style={[styles.previewTitle, updateReady && { color: colors.ice }]}>
            {updateReady ? 'Update Ready — Tap to Restart' : 'Check for App Updates'}
          </Text>
          <Text style={styles.previewSub}>
            {updateReady
              ? 'New version downloaded · Applies in ~1 second'
              : 'Pull the latest over-the-air update without waiting'}
          </Text>
        </View>
        <ChevronRight color={updateReady ? colors.ice : colors.textSecondary} size={20} />
      </Pressable>

      {/* 7. App & Integration Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          {CONFIG.app.name} v{CONFIG.app.version}
        </Text>
        <Text style={styles.infoLine}>• Active Tab: {CONFIG.sheet.tabName}</Text>
        <Text style={styles.infoLine}>• Mode: Offline-First AsyncStorage</Text>
        <Text style={styles.infoLine}>
          • 18:30 Dispatch Push: {serverPushActive ? 'Active (Live Server)' : 'Local Fallback'}
        </Text>
        <Text style={styles.infoLine}>• Weather API: MET Norway Locationforecast 2.0</Text>
        {updateInfo.shortId ? (
          <Text style={styles.infoLine}>
            • OTA Build: {updateInfo.shortId}
            {updateInfo.createdAtLabel ? ` (${updateInfo.createdAtLabel})` : ''}
          </Text>
        ) : null}
      </View>

      <GuideManualModal visible={showManual} onClose={() => setShowManual(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cardGap: { gap: 10 },
  cardHeader: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  caption: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  textInput: {
    minHeight: 52,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  toggleGroup: { gap: 8 },
  contractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'flex-start',
  },
  contractBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  contractTextCol: { flex: 1 },
  contractTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  contractSub: { color: colors.textSecondary, fontSize: 12 },
  contractTextActive: { color: colors.background },
  toggleRow: { flexDirection: 'row', gap: 8 },
  mountainBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
  },
  mountainBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  mountainText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  mountainTextActive: { color: colors.background },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  saveBtnText: { color: colors.background, fontSize: 18, fontWeight: '800' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  updateReadyCard: {
    borderColor: colors.ice,
    backgroundColor: colors.iceDarkBg,
  },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  previewSub: { color: colors.textSecondary, fontSize: 12 },
  infoCard: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  infoTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  infoLine: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.75 },
});