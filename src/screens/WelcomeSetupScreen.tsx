import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Building2, Check, Clock, Compass } from 'lucide-react-native';

import { useActiveTour } from '../context/ActiveTourContext';
import type { ContractType } from '../services/googleSheetsService';
import { colors, sharedStyles, touchTarget } from '../theme';

export function WelcomeSetupScreen() {
  const { completeInitialSetup } = useActiveTour();
  const [initials, setInitials] = useState('');
  const [fullName, setFullName] = useState('');
  const [contractType, setContractType] = useState<ContractType>('full-time');
  const [defaultMountain, setDefaultMountain] = useState<'tverrfjellet' | 'rundfjellet'>(
    'tverrfjellet'
  );
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    const cleanInitials = initials.trim();
    const cleanName = fullName.trim();

    if (!cleanInitials || !cleanName) {
      Alert.alert(
        'Missing Info',
        'Please enter your schedule initials (e.g. To, He, Mh) and your first name.'
      );
      return;
    }

    setSaving(true);
    try {
      await completeInitialSetup({
        initials: cleanInitials,
        fullName: cleanName,
        contractType,
        defaultMountain,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={sharedStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={sharedStyles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Compass color={colors.background} size={32} />
          </View>
          <Text style={styles.title}>Arctic Guide Setup</Text>
          <Text style={styles.subtitle}>
            Enter your schedule details once so the app loads your tours, days off, and post-trip reports.
          </Text>
        </View>

        <View style={[sharedStyles.card, styles.card]}>
          <Text style={styles.label}>Schedule Initials (as written in tour cells)</Text>
          <TextInput
            value={initials}
            onChangeText={setInitials}
            placeholder="e.g. To, He, Si, Mh"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoCapitalize="words"
            maxLength={6}
          />

          <Text style={styles.label}>First Name (column header in BQ–CZ)</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Tomas, Heli, Michal"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoCapitalize="words"
          />
        </View>

        <View style={[sharedStyles.card, styles.card]}>
          <Text style={styles.label}>Contract Type</Text>
          <Pressable
            onPress={() => setContractType('full-time')}
            style={[
              touchTarget,
              styles.optionBtn,
              contractType === 'full-time' && styles.optionBtnActive,
            ]}
          >
            <Building2
              color={contractType === 'full-time' ? colors.background : colors.text}
              size={20}
            />
            <View style={styles.optionCopy}>
              <Text
                style={[
                  styles.optionTitle,
                  contractType === 'full-time' && styles.optionTextActive,
                ]}
              >
                Full-Time (100%)
              </Text>
              <Text
                style={[
                  styles.optionSub,
                  contractType === 'full-time' && styles.optionTextActive,
                ]}
              >
                Empty = Base Duty · Initials = Day Off
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setContractType('part-time')}
            style={[
              touchTarget,
              styles.optionBtn,
              contractType === 'part-time' && styles.optionBtnActive,
            ]}
          >
            <Clock
              color={contractType === 'part-time' ? colors.background : colors.text}
              size={20}
            />
            <View style={styles.optionCopy}>
              <Text
                style={[
                  styles.optionTitle,
                  contractType === 'part-time' && styles.optionTextActive,
                ]}
              >
                Part-Time (20%)
              </Text>
              <Text
                style={[
                  styles.optionSub,
                  contractType === 'part-time' && styles.optionTextActive,
                ]}
              >
                Empty cell = Day Off
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={[sharedStyles.card, styles.card]}>
          <Text style={styles.label}>Default Hill Hike Mountain</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => setDefaultMountain('tverrfjellet')}
              style={[
                touchTarget,
                styles.halfBtn,
                defaultMountain === 'tverrfjellet' && styles.optionBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.optionTitle,
                  defaultMountain === 'tverrfjellet' && styles.optionTextActive,
                ]}
              >
                Tverrfjellet (524m)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDefaultMountain('rundfjellet')}
              style={[
                touchTarget,
                styles.halfBtn,
                defaultMountain === 'rundfjellet' && styles.optionBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.optionTitle,
                  defaultMountain === 'rundfjellet' && styles.optionTextActive,
                ]}
              >
                Rundfjellet (472m)
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={() => void handleContinue()}
          disabled={saving}
          style={({ pressed }) => [touchTarget, styles.submitBtn, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <>
              <Check color={colors.background} size={22} strokeWidth={3} />
              <Text style={styles.submitText}>Save & Load My Schedule</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingTop: 48,
    paddingBottom: 36,
    gap: 14,
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    gap: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  optionBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  optionSub: { color: colors.textSecondary, fontSize: 12 },
  optionTextActive: { color: colors.background },
  row: { flexDirection: 'row', gap: 8 },
  halfBtn: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  submitBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 16,
    marginTop: 4,
  },
  submitText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '900',
  },
  pressed: { opacity: 0.78 },
});