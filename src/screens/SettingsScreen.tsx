import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Building2, Check, Clock, Mountain, ShieldCheck, User } from 'lucide-react-native';

import { CONFIG } from '../config';
import {
  getGuideProfile,
  saveGuideProfile,
  type ContractType,
  type GuideProfile,
} from '../services/googleSheetsService';
import { colors, sharedStyles, touchTarget } from '../theme';

export function SettingsScreen() {
  const [initials, setInitials] = useState('Mh');
  const [fullName, setFullName] = useState('Michal');
  const [contractType, setContractType] = useState<ContractType>('full-time');
  const [defaultMountain, setDefaultMountain] = useState('tverrfjellet');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const profile = await getGuideProfile();
      setInitials(profile.initials);
      setFullName(profile.fullName);
      setContractType(profile.contractType);
      setDefaultMountain(profile.defaultMountain);
    })();
  }, []);

  const handleSave = async () => {
    const updated: GuideProfile = {
      initials: initials.trim() || 'Mh',
      fullName: fullName.trim() || 'Michal',
      contractType,
      defaultMountain,
    };
    await saveGuideProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    Alert.alert('Settings Saved', 'Profile preferences updated.');
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
          Governs how the roster columns (BL-BM) interpret empty cells.
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
            <Building2 color={contractType === 'full-time' ? colors.background : colors.text} size={20} />
            <View style={styles.contractTextCol}>
              <Text style={[styles.contractTitle, contractType === 'full-time' && styles.contractTextActive]}>
                Full-Time (100%)
              </Text>
              <Text style={[styles.contractSub, contractType === 'full-time' && styles.contractTextActive]}>
                Empty cell = Base/Shop Duty
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
            <Clock color={contractType === 'part-time' ? colors.background : colors.text} size={20} />
            <View style={styles.contractTextCol}>
              <Text style={[styles.contractTitle, contractType === 'part-time' && styles.contractTextActive]}>
                Part-Time (20%)
              </Text>
              <Text style={[styles.contractSub, contractType === 'part-time' && styles.contractTextActive]}>
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
            <Text style={[styles.mountainText, defaultMountain === 'tverrfjellet' && styles.mountainTextActive]}>
              Tverrfjellet (675m)
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
            <Text style={[styles.mountainText, defaultMountain === 'rundfjellet' && styles.mountainTextActive]}>
              Rundfjellet (760m)
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

      {/* 5. App & Integration Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>{CONFIG.app.name} v{CONFIG.app.version}</Text>
        <Text style={styles.infoLine}>• Active Tab: {CONFIG.sheet.tabName}</Text>
        <Text style={styles.infoLine}>• Mode: Offline-First AsyncStorage</Text>
        <Text style={styles.infoLine}>• Weather API: MET Norway Locationforecast 2.0</Text>
      </View>
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
  infoCard: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  infoTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  infoLine: { color: colors.textSecondary, fontSize: 12 },
  pressed: { opacity: 0.75 },
});