import { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react-native';

import { useRoster } from '../hooks/useRoster';
import {
  getCachedSchedule,
  getGuideProfile,
  parseGuideAssignments,
  type GuideAssignment,
} from '../services/googleSheetsService';
import { parseGuestsFromComment } from '../utils/commentParser';
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
  } catch {}

  try {
    await Linking.openURL(EMERGENCY_TEL);
  } catch {
    Alert.alert('Emergency call failed', 'Dial 113 manually.');
  }
}

export function RosterScreen() {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedTourIndex, setSelectedTourIndex] = useState<number>(0);
  const [dayAssignments, setDayAssignments] = useState<GuideAssignment[]>([]);

  const [name, setName] = useState('');
  const [bootSize, setBootSize] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');

  // Re-read cached schedule every time user taps the Roster tab or changes the date
  const loadDayAssignments = useCallback(async () => {
    const profile = await getGuideProfile();
    const cached = await getCachedSchedule();
    if (cached) {
      const { assignments } = parseGuideAssignments(
        cached.values,
        cached.notes,
        cached.comments,
        profile.initials,
        selectedDate
      );
      setDayAssignments(assignments);
      setSelectedTourIndex(0);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      void loadDayAssignments();
    }, [loadDayAssignments])
  );

  const activeTour: GuideAssignment | null = dayAssignments[selectedTourIndex] ?? null;

  // Distinct storage key per tour (date + tour name + index)
  const tourKey = activeTour
    ? `${selectedDate.toISOString().slice(0, 10)}_${activeTour.tourName.replace(/\s+/g, '_')}_${selectedTourIndex}`
    : `free_${selectedDate.toISOString().slice(0, 10)}`;

  const roster = useRoster(tourKey);

  // Parse candidate guest names from the active tour's comments
  const parsedCandidates = useMemo(() => {
    if (!activeTour) return [];

    const commentTexts = (activeTour.commentsList || []).map((c) => {
      const replyTexts = (c.replies || []).map((r) => r.content).join('\n');
      return `${c.content}\n${replyTexts}`;
    });

    if (activeTour.cellNote) {
      commentTexts.push(activeTour.cellNote);
    }

    return parseGuestsFromComment(commentTexts.join('\n'));
  }, [activeTour]);

  const handleShiftDate = (days: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const handleResetToToday = () => {
    setSelectedDate(new Date());
  };

  const handleImportCandidates = () => {
    if (parsedCandidates.length === 0) return;
    const added = roster.importGuests(parsedCandidates);
    Alert.alert('Roster Updated', `Imported ${added} guest(s) for this tour.`);
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Tour Roster?',
      'This will remove all guests from the scratchpad for this specific tour.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: roster.clearRoster },
      ]
    );
  };

  const addGuest = () => {
    if (!name.trim()) return;
    roster.addGuest({ name, bootSize, height, weight, medicalNotes });
    setName('');
    setBootSize('');
    setHeight('');
    setWeight('');
    setMedicalNotes('');
  };

  const dateLabel = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const isToday = new Date().toDateString() === selectedDate.toDateString();

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
        {/* 1. Emergency 113 Button */}
        <Pressable
          accessibilityRole="button"
          onPress={() => void openHjelp113()}
          style={({ pressed }) => [touchTarget, styles.emergency, pressed && styles.pressed]}
        >
          <Phone color={colors.text} size={26} />
          <View style={styles.emergencyCopy}>
            <Text style={styles.emergencyTitle}>Hjelp 113</Text>
            <Text style={styles.emergencyDetail}>Opens the app, or dials 113</Text>
          </View>
        </Pressable>

        {/* 2. Date Navigation Bar */}
        <View style={styles.dateBar}>
          <Pressable
            onPress={() => handleShiftDate(-1)}
            style={({ pressed }) => [touchTarget, styles.dateNavBtn, pressed && styles.pressed]}
          >
            <ChevronLeft color={colors.text} size={24} />
          </Pressable>

          <Pressable onPress={handleResetToToday} style={styles.dateCenter}>
            <Text style={styles.dateLabelText}>{dateLabel}</Text>
            <Text style={[styles.todayBadge, isToday && styles.todayBadgeActive]}>
              {isToday ? 'TODAY' : 'TAP FOR TODAY'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleShiftDate(1)}
            style={({ pressed }) => [touchTarget, styles.dateNavBtn, pressed && styles.pressed]}
          >
            <ChevronRight color={colors.text} size={24} />
          </Pressable>
        </View>

        {/* 3. Multi-Tour Selector Tabs (Shows when 2 or more tours assigned!) */}
        {dayAssignments.length > 1 ? (
          <View style={styles.tourTabsSection}>
            <Text style={styles.subLabel}>SELECT TOUR ({dayAssignments.length} ASSIGNED)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tourTabsScroll}>
              {dayAssignments.map((tour, idx) => {
                const isSelected = idx === selectedTourIndex;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => setSelectedTourIndex(idx)}
                    style={[styles.tourTabPill, isSelected && styles.tourTabPillActive]}
                  >
                    <Text style={[styles.tourTabPillText, isSelected && styles.tourTabPillTextActive]}>
                      {idx + 1}. {tour.tourName.slice(0, 26)} ({tour.guestCount} pax)
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* 4. Active Tour Header Card */}
        {activeTour ? (
          <View style={styles.activeTourCard}>
            <View style={styles.activeTourHeader}>
              <Text style={styles.activeTourCategory}>
                {activeTour.isCharter ? '🚢 CHARTER' : '🏔️ REGULAR TOUR'} • {activeTour.activity.toUpperCase()}
              </Text>
              {activeTour.vehicle ? (
                <View style={styles.vehicleBadge}>
                  <Text style={styles.vehicleText}>{activeTour.vehicle}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.activeTourTitle}>{activeTour.tourName}</Text>
            <Text style={styles.activeTourPax}>
              Expected Guests: {activeTour.guestCount > 0 ? `${activeTour.guestCount} pax` : 'Open'}
            </Text>
          </View>
        ) : (
          <View style={[sharedStyles.card, styles.emptyTourCard]}>
            <Text style={styles.emptyTourTitle}>No Tour Assigned on {dateLabel}</Text>
            <Text style={sharedStyles.secondary}>Use the arrows above to select a tour date.</Text>
          </View>
        )}

        {/* 5. Comment Import Banner */}
        {parsedCandidates.length > 0 ? (
          <View style={styles.importBanner}>
            <View style={styles.importHeader}>
              <Users color={colors.accent} size={20} />
              <Text style={styles.importTitle}>Found {parsedCandidates.length} Guest(s) in Notes</Text>
            </View>
            <Text style={styles.importPreview} numberOfLines={2}>
              {parsedCandidates
                .map((c) => {
                  const specs = [c.bootSize && `EU${c.bootSize}`, c.height, c.weight].filter(Boolean).join(', ');
                  return `${c.name}${specs ? ` (${specs})` : ''}`;
                })
                .join(' • ')}
            </Text>
            <Pressable
              onPress={handleImportCandidates}
              style={({ pressed }) => [touchTarget, styles.importBtn, pressed && styles.pressed]}
            >
              <Download color={colors.background} size={20} />
              <Text style={styles.importBtnText}>Import {parsedCandidates.length} Guests to This Tour</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 6. Manual Add Walk-In Guest */}
        <Text style={sharedStyles.sectionTitle}>Add Walk-In Guest</Text>
        <Field label="Guest Name" value={name} onChangeText={setName} placeholder="e.g. John Doe" />

        <View style={styles.specRow}>
          <View style={styles.specCol}>
            <Field label="Shoe" value={bootSize} onChangeText={setBootSize} placeholder="34" />
          </View>
          <View style={styles.specCol}>
            <Field label="Height" value={height} onChangeText={setHeight} placeholder="180 cm" />
          </View>
          <View style={styles.specCol}>
            <Field label="Weight" value={weight} onChangeText={setWeight} placeholder="75 kg" />
          </View>
        </View>

        <Field
          label="Medical / Dietary Notes"
          value={medicalNotes}
          onChangeText={setMedicalNotes}
          placeholder="e.g. Asthma, vegan, knee issue"
          multiline
        />

        <Pressable
          accessibilityRole="button"
          onPress={addGuest}
          style={({ pressed }) => [touchTarget, styles.addButton, pressed && styles.pressed]}
        >
          <Plus color={colors.background} size={22} />
          <Text style={styles.addLabel}>Add to This Tour</Text>
        </Pressable>

        {/* 7. Tour Roster List */}
        <View style={styles.rosterHeaderRow}>
          <Text style={sharedStyles.sectionTitle}>
            Roster ({roster.guests.length}{activeTour?.guestCount ? ` / ${activeTour.guestCount}` : ''})
          </Text>
          {roster.guests.length > 0 ? (
            <Pressable onPress={handleClearAll} style={styles.clearBtn}>
              <RotateCcw color={colors.textSecondary} size={16} />
              <Text style={styles.clearBtnText}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {roster.guests.length === 0 ? (
          <Text style={sharedStyles.secondary}>
            No guests registered for this tour yet. Tap Import above or add walk-ins manually.
          </Text>
        ) : (
          roster.guests.map((guest) => (
            <View key={guest.id} style={[sharedStyles.card, styles.guestCard]}>
              <View style={styles.guestHeader}>
                <Text style={styles.guestName}>{guest.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => roster.removeGuest(guest.id)}
                  style={({ pressed }) => [touchTarget, styles.delete, pressed && styles.pressed]}
                >
                  <Trash2 color={colors.danger} size={20} />
                </Pressable>
              </View>

              <View style={styles.specRow}>
                <View style={styles.specCol}>
                  <Field
                    label="Shoe"
                    value={guest.bootSize}
                    onChangeText={(boot) => roster.updateGuest(guest.id, { bootSize: boot })}
                    placeholder="Size"
                  />
                </View>
                <View style={styles.specCol}>
                  <Field
                    label="Height"
                    value={guest.height}
                    onChangeText={(h) => roster.updateGuest(guest.id, { height: h })}
                    placeholder="Height"
                  />
                </View>
                <View style={styles.specCol}>
                  <Field
                    label="Weight"
                    value={guest.weight}
                    onChangeText={(w) => roster.updateGuest(guest.id, { weight: w })}
                    placeholder="Weight"
                  />
                </View>
              </View>

              <Field
                label="Medical / Dietary Notes"
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
  emergencyCopy: { flexShrink: 1 },
  emergencyTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  emergencyDetail: { color: colors.text, fontSize: 15 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  dateNavBtn: { width: 52, height: 52, justifyContent: 'center', alignItems: 'center' },
  dateCenter: { alignItems: 'center', paddingVertical: 8 },
  dateLabelText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  todayBadge: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginTop: 2 },
  todayBadgeActive: { color: colors.accent },
  tourTabsSection: { gap: 6, marginTop: 8 },
  subLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tourTabsScroll: { gap: 8, paddingVertical: 2 },
  tourTabPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tourTabPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tourTabPillText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  tourTabPillTextActive: { color: colors.background, fontWeight: '800' },
  activeTourCard: {
    backgroundColor: '#0F172A',
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 4,
    marginTop: 8,
  },
  activeTourHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeTourCategory: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  vehicleBadge: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  vehicleText: { color: '#38BDF8', fontSize: 12, fontWeight: '800' },
  activeTourTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  activeTourPax: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  emptyTourCard: { alignItems: 'center', paddingVertical: 20, gap: 4, marginTop: 8 },
  emptyTourTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  importBanner: {
    backgroundColor: '#0C4A6E',
    borderColor: '#38BDF8',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  importHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  importPreview: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  importBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
  },
  importBtnText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  field: { gap: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputMultiline: { minHeight: 68, textAlignVertical: 'top' },
  specRow: { flexDirection: 'row', gap: 8 },
  specCol: { flex: 1 },
  addButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  addLabel: { color: colors.background, fontSize: 17, fontWeight: '800' },
  rosterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  clearBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  guestCard: { gap: 8 },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guestName: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 },
  delete: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
});