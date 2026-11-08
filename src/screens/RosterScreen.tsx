import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Phone, Plus, Trash2 } from 'lucide-react-native';

import { useRoster } from '../hooks/useRoster';
import { colors, sharedStyles, touchTarget } from '../theme';

const HJELP_113_URL = 'android-app://no.norskluftambulanse.hjelp113';
const EMERGENCY_TEL = 'tel:113';

async function openHjelp113(): Promise<void> {
  try {
    const canOpenApp = await Linking.canOpenURL(HJELP_113_URL);
    if (canOpenApp) {
      await Linking.openURL(HJELP_113_URL);
      return;
    }
  } catch {
    // The package query can fail on older builds. Dial 113 instead.
  }

  try {
    await Linking.openURL(EMERGENCY_TEL);
  } catch {
    Alert.alert('Emergency call failed', 'Dial 113 manually.');
  }
}

export function RosterScreen() {
  const roster = useRoster();
  const [name, setName] = useState('');
  const [bootSize, setBootSize] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');

  const addGuest = () => {
    if (!name.trim()) {
      return;
    }
    roster.addGuest({ name, bootSize, medicalNotes });
    setName('');
    setBootSize('');
    setMedicalNotes('');
  };

  return (
    <KeyboardAvoidingView
      style={sharedStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={sharedStyles.screen}
        contentContainerStyle={sharedStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Hjelp 113, or dial 113"
          onPress={() => {
            void openHjelp113();
          }}
          style={({ pressed }) => [touchTarget, styles.emergency, pressed && styles.pressed]}
        >
          <Phone color={colors.text} size={26} />
          <View style={styles.emergencyCopy}>
            <Text style={styles.emergencyTitle}>Hjelp 113</Text>
            <Text style={styles.emergencyDetail}>Opens the app, or dials 113</Text>
          </View>
        </Pressable>

        <Text style={sharedStyles.sectionTitle}>Add a guest</Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Guest name" />
        <Field
          label="Boot / snowshoe size"
          value={bootSize}
          onChangeText={setBootSize}
          placeholder="42 / L"
        />
        <Field
          label="Medical notes"
          value={medicalNotes}
          onChangeText={setMedicalNotes}
          placeholder="Asthma, knee issue"
          multiline
        />
        <Pressable
          accessibilityRole="button"
          onPress={addGuest}
          style={({ pressed }) => [touchTarget, styles.addButton, pressed && styles.pressed]}
        >
          <Plus color={colors.background} size={22} />
          <Text style={styles.addLabel}>Add guest</Text>
        </Pressable>

        <Text style={sharedStyles.sectionTitle}>
          Today’s roster{roster.ready ? ` · ${roster.guests.length}` : ''}
        </Text>
        {roster.guests.length === 0 ? (
          <Text style={sharedStyles.secondary}>No guests yet. Names stay on this phone.</Text>
        ) : (
          roster.guests.map((guest) => (
            <View key={guest.id} style={[sharedStyles.card, styles.guestCard]}>
              <View style={styles.guestHeader}>
                <Text style={styles.guestName}>{guest.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${guest.name}`}
                  onPress={() => roster.removeGuest(guest.id)}
                  style={({ pressed }) => [touchTarget, styles.delete, pressed && styles.pressed]}
                >
                  <Trash2 color={colors.danger} size={22} />
                </Pressable>
              </View>
              <Field
                label="Boot / snowshoe size"
                value={guest.bootSize}
                onChangeText={(boot) => roster.updateGuest(guest.id, { bootSize: boot })}
                placeholder="Size"
              />
              <Field
                label="Medical notes"
                value={guest.medicalNotes}
                onChangeText={(notes) => roster.updateGuest(guest.id, { medicalNotes: notes })}
                placeholder="None"
                multiline
              />
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, multiline && styles.inputMultiline]}
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emergency: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.danger,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  emergencyCopy: {
    flexShrink: 1,
  },
  emergencyTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  emergencyDetail: {
    color: colors.text,
    fontSize: 15,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  addButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  addLabel: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '800',
  },
  guestCard: {
    gap: 10,
  },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guestName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
  },
  delete: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
});
