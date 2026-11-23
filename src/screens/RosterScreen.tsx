import { useMemo, useState } from 'react';
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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';

import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useRoster } from '../hooks/useRoster';
import { colors, sharedStyles, touchTarget } from '../theme';
import { parseGuestsFromComment } from '../utils/commentParser';

export function RosterScreen() {
  const {
    assignments,
    selectedAssignmentIdx,
    activeAssignment,
    selectedDate,
    tourKey,
    selectAssignment,
    shiftDate,
    resetToToday,
  } = useActiveTour();

  const roster = useRoster(tourKey);

  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedGuestId, setExpandedGuestId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [bootSize, setBootSize] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');

  const parsedCandidates = useMemo(() => {
    if (!activeAssignment) return [];

    const commentTexts = (activeAssignment.commentsList || []).map((c) => {
      const replyTexts = (c.replies || []).map((r) => r.content).join('\n');
      return `${c.content}\n${replyTexts}`;
    });

    if (activeAssignment.cellNote) {
      commentTexts.push(activeAssignment.cellNote);
    }

    return parseGuestsFromComment(commentTexts.join('\n'));
  }, [activeAssignment]);

  const handleImportCandidates = () => {
    if (parsedCandidates.length === 0) return;
    const added = roster.importGuests(
      parsedCandidates.map((c) => ({ ...c, partySize: 1 }))
    );
    Alert.alert('Roster Updated', `Imported ${added} guest(s) for this tour.`);
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Tour Roster?',
      'Remove all guests from this tour scratchpad?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: roster.clearRoster },
      ]
    );
  };

  const addGuest = () => {
    if (!name.trim()) return;
    roster.addGuest({
      name,
      partySize,
      bootSize,
      height,
      weight,
      medicalNotes,
    });
    setName('');
    setPartySize(1);
    setBootSize('');
    setHeight('');
    setWeight('');
    setMedicalNotes('');
    setShowAddForm(false);
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
        contentContainerStyle={styles.compactContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.dateBar}>
          <Pressable
            onPress={() => shiftDate(-1)}
            style={({ pressed }) => [styles.dateArrow, pressed && styles.pressed]}
          >
            <ChevronLeft color={colors.text} size={20} />
          </Pressable>

          <Pressable onPress={resetToToday} style={styles.dateCenter}>
            <Text style={styles.dateLabelText}>
              {dateLabel}
              {!isToday ? ' · Tap for Today' : ''}
            </Text>
            {activeAssignment ? (
              <Text style={styles.activeTourSub} numberOfLines={1}>
                {activeAssignment.tourName} ({activeAssignment.guestCount} pax)
              </Text>
            ) : (
              <Text style={styles.activeTourSub}>No tour assigned</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => shiftDate(1)}
            style={({ pressed }) => [styles.dateArrow, pressed && styles.pressed]}
          >
            <ChevronRight color={colors.text} size={20} />
          </Pressable>
        </View>

        {assignments.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tourTabsScroll}
          >
            {assignments.map((tour, idx) => {
              const isSelected = idx === selectedAssignmentIdx;
              return (
                <Pressable
                  key={`${tour.tourName}-${idx}`}
                  onPress={() => selectAssignment(idx)}
                  style={[styles.tourPill, isSelected && styles.tourPillActive]}
                >
                  <Text style={[styles.tourPillText, isSelected && styles.tourPillTextActive]}>
                    {tour.startTimeLabel ?? `${idx + 1}.`} {tour.tourName.slice(0, 18)} (
                    {tour.guestCount})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.actionRow}>
          {parsedCandidates.length > 0 ? (
            <Pressable
              onPress={handleImportCandidates}
              style={({ pressed }) => [touchTarget, styles.importBtn, pressed && styles.pressed]}
            >
              <Download color={colors.background} size={18} />
              <Text style={styles.importBtnText}>Import {parsedCandidates.length}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setShowAddForm((v) => !v)}
            style={({ pressed }) => [
              touchTarget,
              styles.addToggleBtn,
              pressed && styles.pressed,
            ]}
          >
            {showAddForm ? (
              <>
                <X color={colors.text} size={18} />
                <Text style={styles.addToggleText}>Close Form</Text>
              </>
            ) : (
              <>
                <Plus color={colors.background} size={18} />
                <Text style={styles.addToggleTextDark}>Add Guest</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => void Linking.openURL(CONFIG.links.iticketPortal)}
            style={({ pressed }) => [
              touchTarget,
              styles.iticketBtn,
              pressed && styles.pressed,
            ]}
          >
            <ExternalLink color={colors.ice} size={16} />
            <Text style={styles.iticketBtnText}>iTicket</Text>
          </Pressable>
        </View>

        {showAddForm ? (
          <View style={[sharedStyles.card, styles.addFormCard]}>
            <View style={styles.nameAndPaxRow}>
              <View style={styles.nameCol}>
                <Field
                  label="Lead Name"
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. John Smith"
                />
              </View>
              <View style={styles.paxCol}>
                <Text style={styles.fieldLabel}>Persons</Text>
                <View style={styles.stepperBox}>
                  <Pressable
                    onPress={() => setPartySize((n) => Math.max(1, n - 1))}
                    style={styles.stepperBtn}
                  >
                    <Minus color={colors.text} size={16} />
                  </Pressable>
                  <Text style={styles.stepperVal}>{partySize}</Text>
                  <Pressable
                    onPress={() => setPartySize((n) => Math.min(30, n + 1))}
                    style={styles.stepperBtn}
                  >
                    <Plus color={colors.text} size={16} />
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.specRow}>
              <View style={styles.specCol}>
                <Field label="Shoe" value={bootSize} onChangeText={setBootSize} placeholder="42" />
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
              placeholder="e.g. Asthma, vegan"
            />
            <Pressable
              onPress={addGuest}
              style={({ pressed }) => [touchTarget, styles.saveGuestBtn, pressed && styles.pressed]}
            >
              <Text style={styles.saveGuestText}>
                Save ({partySize} {partySize === 1 ? 'person' : 'persons'})
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.rosterHeader}>
          <View style={styles.rosterCountRow}>
            <Users color={colors.accent} size={18} />
            <Text style={styles.rosterTitle}>
              Guests ({roster.totalGuestsCount}
              {activeAssignment?.guestCount ? ` / ${activeAssignment.guestCount}` : ''})
            </Text>
          </View>
          {roster.guests.length > 0 ? (
            <Pressable onPress={handleClearAll} style={styles.resetBtn}>
              <RotateCcw color={colors.textSecondary} size={14} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {roster.guests.length === 0 ? (
          <Text style={sharedStyles.secondary}>
            No guests yet. Tap Import or + Add Guest above.
          </Text>
        ) : (
          <View style={styles.guestList}>
            {roster.guests.map((guest, index) => {
              const isExpanded = expandedGuestId === guest.id;
              const specs = [guest.bootSize && `EU${guest.bootSize}`, guest.height, guest.weight]
                .filter(Boolean)
                .join(' · ');
              const pax = guest.partySize || 1;

              return (
                <View key={guest.id} style={styles.guestRowCard}>
                  <Pressable
                    onPress={() =>
                      setExpandedGuestId(isExpanded ? null : guest.id)
                    }
                    style={({ pressed }) => [styles.guestCompactRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.guestIndex}>{index + 1}.</Text>
                    <View style={styles.guestMainCol}>
                      <View style={styles.guestNameRow}>
                        <Text style={styles.guestName} numberOfLines={1}>
                          {guest.name}
                        </Text>
                        {pax > 1 ? (
                          <View style={styles.paxBadge}>
                            <Text style={styles.paxBadgeText}>{pax} pax</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.guestSpecs} numberOfLines={1}>
                        {specs || 'No sizes'}
                      </Text>
                    </View>

                    {guest.medicalNotes ? (
                      <View style={styles.medPill}>
                        <Text style={styles.medPillText} numberOfLines={1}>
                          {guest.medicalNotes}
                        </Text>
                      </View>
                    ) : null}

                    {isExpanded ? (
                      <ChevronUp color={colors.accent} size={18} />
                    ) : (
                      <ChevronDown color={colors.textSecondary} size={18} />
                    )}
                  </Pressable>

                  {isExpanded ? (
                    <View style={styles.expandedEdit}>
                      <View style={styles.expandedPaxRow}>
                        <Text style={styles.fieldLabel}>Party Size (Persons)</Text>
                        <View style={styles.stepperBox}>
                          <Pressable
                            onPress={() =>
                              roster.updateGuest(guest.id, {
                                partySize: Math.max(1, pax - 1),
                              })
                            }
                            style={styles.stepperBtn}
                          >
                            <Minus color={colors.text} size={16} />
                          </Pressable>
                          <Text style={styles.stepperVal}>{pax}</Text>
                          <Pressable
                            onPress={() =>
                              roster.updateGuest(guest.id, {
                                partySize: Math.min(30, pax + 1),
                              })
                            }
                            style={styles.stepperBtn}
                          >
                            <Plus color={colors.text} size={16} />
                          </Pressable>
                        </View>
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
                      <View style={styles.expandedBottomRow}>
                        <View style={styles.medInputWrap}>
                          <Field
                            label="Medical / Dietary"
                            value={guest.medicalNotes}
                            onChangeText={(notes) =>
                              roster.updateGuest(guest.id, { medicalNotes: notes })
                            }
                            placeholder="None"
                          />
                        </View>
                        <Pressable
                          onPress={() => roster.removeGuest(guest.id)}
                          style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                        >
                          <Trash2 color={colors.danger} size={18} />
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  compactContent: {
    padding: 12,
    paddingBottom: 28,
    gap: 8,
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 4,
    minHeight: 48,
  },
  dateArrow: { width: 42, height: 44, justifyContent: 'center', alignItems: 'center' },
  dateCenter: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dateLabelText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  activeTourSub: { color: colors.accentSoft, fontSize: 11, fontWeight: '700' },
  tourTabsScroll: { gap: 6, paddingVertical: 2 },
  tourPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tourPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tourPillText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  tourPillTextActive: { color: colors.background, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8 },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.ice,
    borderRadius: 12,
    minHeight: 44,
  },
  importBtnText: { color: colors.background, fontSize: 14, fontWeight: '800' },
  addToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
  },
  addToggleTextDark: { color: colors.background, fontSize: 14, fontWeight: '800' },
  addToggleText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  iticketBtn: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  iticketBtnText: { color: colors.ice, fontSize: 13, fontWeight: '800' },
  addFormCard: { padding: 12, gap: 8 },
  nameAndPaxRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  nameCol: { flex: 1 },
  paxCol: { gap: 3 },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 4,
    gap: 6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperVal: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    minWidth: 22,
    textAlign: 'center',
  },
  saveGuestBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    marginTop: 4,
  },
  saveGuestText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  rosterCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rosterTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  resetText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  guestList: { gap: 6 },
  guestRowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  guestCompactRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  guestIndex: { color: colors.textSecondary, fontSize: 13, fontWeight: '800', width: 20 },
  guestMainCol: { flex: 1 },
  guestNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestName: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  paxBadge: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  paxBadgeText: { color: colors.accentSoft, fontSize: 11, fontWeight: '800' },
  guestSpecs: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  medPill: {
    maxWidth: 105,
    backgroundColor: '#451A03',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  medPillText: { color: '#FDE68A', fontSize: 11, fontWeight: '800' },
  expandedEdit: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 10,
    gap: 8,
    backgroundColor: '#09090B',
  },
  expandedPaxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedBottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  medInputWrap: { flex: 1 },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: { gap: 3 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  input: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  specRow: { flexDirection: 'row', gap: 6 },
  specCol: { flex: 1 },
  pressed: { opacity: 0.75 },
});