import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Minus,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react-native';

import { CONFIG } from '../config';
import { useActiveTour } from '../context/ActiveTourContext';
import { useRoster } from '../hooks/useRoster';
import { colors, sharedStyles, touchTarget } from '../theme';
import { parseGuestsFromComment } from '../utils/commentParser';
import {
  parseIticketManifestXlsx,
  parseIticketPastedText,
  type ManifestGuest,
  type ManifestTourSheet,
} from '../utils/iticketManifestParser';

function showFeedback(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

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

  const [showImportModal, setShowImportModal] = useState(false);
  const [pastedManifest, setPastedManifest] = useState('');
  const [parsedXlsxSheets, setParsedXlsxSheets] = useState<ManifestTourSheet[] | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState('');
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
    showFeedback('Roster Updated', `Imported ${added} guest(s) from sheet notes.`);
  };

  const commitManifestGuests = (incoming: ManifestGuest[], sourceLabel: string) => {
    if (incoming.length === 0) {
      setImportNotice('No guest bookings found in that manifest.');
      return;
    }
    const added = roster.importGuests(
      incoming.map((g) => ({
        name: g.name,
        partySize: g.partySize,
        phone: g.phone,
        bookingRef: g.bookingRef,
        bootSize: '',
        height: '',
        weight: '',
        medicalNotes: g.notes,
      }))
    );
    const totalPax = incoming.reduce((s, g) => s + g.partySize, 0);
    setShowImportModal(false);
    setParsedXlsxSheets(null);
    setPastedManifest('');
    setImportNotice(null);
    showFeedback(
      'iTicket Manifest Imported',
      `Added ${added} booking(s) (${totalPax} pax) from ${sourceLabel}.`
    );
  };

  const handleXlsxBytes = (bytes: Uint8Array) => {
    try {
      const sheets = parseIticketManifestXlsx(bytes);
      if (sheets.length === 0) {
        setImportNotice('No guest bookings found inside that .xlsx file.');
        return;
      }
      if (sheets.length === 1) {
        const only = sheets[0]!;
        commitManifestGuests(only.guests, only.tourName);
        return;
      }
      setImportNotice(null);
      setParsedXlsxSheets(sheets);
    } catch (err) {
      setImportNotice(
        err instanceof Error ? err.message : 'Could not read that manifest.xlsx file.'
      );
    }
  };

  const handlePickManifestFile = async () => {
    setImportNotice(null);
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept =
        '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        handleXlsxBytes(new Uint8Array(buf));
      };
      input.click();
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const DocumentPicker = require('expo-document-picker') as {
        getDocumentAsync: (opts: {
          type?: string | string[];
          copyToCacheDirectory?: boolean;
        }) => Promise<{ canceled: boolean; assets?: { uri: string }[] }>;
      };
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const response = await fetch(res.assets[0].uri);
      const buf = await response.arrayBuffer();
      handleXlsxBytes(new Uint8Array(buf));
    } catch {
      setImportNotice(
        'Picking manifest.xlsx directly on Android requires the next Google Play app update. For now, copy & paste the guest cards from iTicket below!'
      );
    }
  };

  const handleImportPasted = () => {
    const parsed = parseIticketPastedText(pastedManifest);
    if (parsed.length === 0) {
      setImportNotice(
        'Could not detect any bookings. Copy the guest cards from iTicket Manifests and paste them above.'
      );
      return;
    }
    commitManifestGuests(parsed, 'pasted iTicket manifest');
  };

  const handleClearAll = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Clear all guests from this tour roster?')) {
        roster.clearRoster();
      }
      return;
    }
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
      phone,
      bootSize,
      height,
      weight,
      medicalNotes,
    });
    setName('');
    setPartySize(1);
    setPhone('');
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

  const sheetPaxMismatch =
    Boolean(activeAssignment?.guestCount) &&
    roster.totalGuestsCount > 0 &&
    roster.totalGuestsCount !== activeAssignment!.guestCount;

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
                <Text style={styles.addToggleText}>Close</Text>
              </>
            ) : (
              <>
                <Plus color={colors.background} size={18} />
                <Text style={styles.addToggleTextDark}>Add Guest</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setParsedXlsxSheets(null);
              setImportNotice(null);
              setShowImportModal(true);
            }}
            style={({ pressed }) => [
              touchTarget,
              styles.manifestBtn,
              pressed && styles.pressed,
            ]}
          >
            <Upload color={colors.background} size={16} />
            <Text style={styles.manifestBtnText}>Manifest</Text>
          </Pressable>

          <Pressable
            onPress={() => void Linking.openURL(CONFIG.links.iticketPortal)}
            style={({ pressed }) => [
              touchTarget,
              styles.iticketBtn,
              pressed && styles.pressed,
            ]}
          >
            <ExternalLink color={colors.ice} size={15} />
            <Text style={styles.iticketBtnText}>iTicket</Text>
          </Pressable>
        </View>

        {parsedCandidates.length > 0 ? (
          <Pressable
            onPress={handleImportCandidates}
            style={({ pressed }) => [styles.sheetNotesImportBar, pressed && styles.pressed]}
          >
            <Download color={colors.ice} size={15} />
            <Text style={styles.sheetNotesImportText}>
              Import {parsedCandidates.length} guest(s) from Sheet notes
            </Text>
          </Pressable>
        ) : null}

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

            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              placeholder="+47..."
            />

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
            {roster.checkedInCount > 0 ? (
              <View style={styles.checkedCountPill}>
                <Text style={styles.checkedCountText}>
                  ✓ {roster.checkedInCount}/{roster.totalGuestsCount}
                </Text>
              </View>
            ) : null}
          </View>
          {roster.guests.length > 0 ? (
            <Pressable onPress={handleClearAll} style={styles.resetBtn}>
              <RotateCcw color={colors.textSecondary} size={14} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          ) : null}
        </View>

        {sheetPaxMismatch ? (
          <View style={styles.mismatchBanner}>
            <Text style={styles.mismatchText}>
              Sheet 1.6 shows {activeAssignment!.guestCount} pax vs {roster.totalGuestsCount} in
              roster — check moved or manual bookings.
            </Text>
          </View>
        ) : null}

        {roster.guests.length === 0 ? (
          <Text style={sharedStyles.secondary}>
            No guests yet. Tap Manifest to import from iTicket or + Add Guest above.
          </Text>
        ) : (
          <View style={styles.guestList}>
            {roster.guests.map((guest, index) => {
              const isExpanded = expandedGuestId === guest.id;
              const specs = [
                guest.bookingRef,
                guest.bootSize && `EU${guest.bootSize}`,
                guest.height,
                guest.weight,
              ]
                .filter(Boolean)
                .join(' · ');
              const pax = guest.partySize || 1;

              return (
                <View
                  key={guest.id}
                  style={[
                    styles.guestRowCard,
                    guest.checkedIn && styles.guestRowCardChecked,
                  ]}
                >
                  <View style={styles.guestCompactRow}>
                    <Pressable
                      onPress={() => roster.toggleCheckedIn(guest.id)}
                      hitSlop={6}
                      style={({ pressed }) => [styles.checkBtn, pressed && styles.pressed]}
                    >
                      {guest.checkedIn ? (
                        <CheckCircle2 color={colors.success} size={22} />
                      ) : (
                        <Circle color={colors.textSecondary} size={22} />
                      )}
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        setExpandedGuestId(isExpanded ? null : guest.id)
                      }
                      style={({ pressed }) => [styles.guestTapArea, pressed && styles.pressed]}
                    >
                      <View style={styles.guestMainCol}>
                        <View style={styles.guestNameRow}>
                          <Text
                            style={[
                              styles.guestName,
                              guest.checkedIn && styles.guestNameChecked,
                            ]}
                            numberOfLines={1}
                          >
                            {index + 1}. {guest.name}
                          </Text>
                          {pax > 1 ? (
                            <View style={styles.paxBadge}>
                              <Text style={styles.paxBadgeText}>{pax} pax</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.guestSpecs} numberOfLines={1}>
                          {specs || 'Tap to add sizes or notes'}
                        </Text>
                      </View>

                      {guest.medicalNotes ? (
                        <View style={styles.medPill}>
                          <Text style={styles.medPillText} numberOfLines={1}>
                            {guest.medicalNotes}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>

                    {guest.phone ? (
                      <Pressable
                        onPress={() =>
                          void Linking.openURL(`tel:${guest.phone.replace(/\s+/g, '')}`)
                        }
                        hitSlop={6}
                        style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
                      >
                        <Phone color={colors.ice} size={16} />
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() =>
                        setExpandedGuestId(isExpanded ? null : guest.id)
                      }
                      hitSlop={6}
                      style={styles.expandChevron}
                    >
                      {isExpanded ? (
                        <ChevronUp color={colors.accent} size={18} />
                      ) : (
                        <ChevronDown color={colors.textSecondary} size={18} />
                      )}
                    </Pressable>
                  </View>

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
                            label="Phone"
                            value={guest.phone}
                            onChangeText={(p) => roster.updateGuest(guest.id, { phone: p })}
                            placeholder="+47..."
                          />
                        </View>
                        <View style={styles.specCol}>
                          <Field
                            label="Booking Ref"
                            value={guest.bookingRef}
                            onChangeText={(ref) =>
                              roster.updateGuest(guest.id, { bookingRef: ref })
                            }
                            placeholder="Ref"
                          />
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

      {/* Import iTicket Manifest Modal (.xlsx File Picker + Paste Fallback) */}
      <Modal
        visible={showImportModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import iTicket Manifest</Text>
              <Pressable
                onPress={() => setShowImportModal(false)}
                style={styles.modalClose}
              >
                <X color={colors.text} size={22} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {parsedXlsxSheets ? (
                <>
                  <Text style={styles.modalHint}>
                    Found {parsedXlsxSheets.length} tours in manifest.xlsx — tap the tour to import:
                  </Text>
                  {parsedXlsxSheets.map((sheet, idx) => {
                    const matchesTime =
                      Boolean(activeAssignment?.startTimeLabel) &&
                      sheet.startTime === activeAssignment?.startTimeLabel;
                    return (
                      <Pressable
                        key={`${sheet.sheetName}-${idx}`}
                        onPress={() => commitManifestGuests(sheet.guests, sheet.tourName)}
                        style={({ pressed }) => [
                          styles.sheetChoiceCard,
                          matchesTime && styles.sheetChoiceCardMatch,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.sheetChoiceTop}>
                          <Text style={styles.sheetChoiceTitle} numberOfLines={1}>
                            {sheet.tourName}
                          </Text>
                          {matchesTime ? (
                            <View style={styles.matchPill}>
                              <Text style={styles.matchPillText}>THIS TOUR</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.sheetChoiceSub}>
                          {sheet.dateIso} · {sheet.startTime} · {sheet.guests.length} booking(s) ·{' '}
                          {sheet.totalPax} pax
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : (
                <>
                  <Text style={styles.modalHint}>
                    Imports locally on your phone (never uploaded). Keeps Sheet 1.6 as headcount
                    truth.
                  </Text>

                  <Pressable
                    onPress={() => void handlePickManifestFile()}
                    style={({ pressed }) => [
                      touchTarget,
                      styles.pickFileBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <FileSpreadsheet color={colors.background} size={18} />
                    <Text style={styles.pickFileBtnText}>Pick manifest.xlsx File</Text>
                  </Pressable>

                  {importNotice ? (
                    <View style={styles.noticeBox}>
                      <Text style={styles.noticeText}>{importNotice}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.modalSubHeading}>OR PASTE FROM iTICKET MANIFEST</Text>
                  <TextInput
                    value={pastedManifest}
                    onChangeText={setPastedManifest}
                    placeholder="Select & copy guest cards from iTicket Manifests, then paste here…"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    style={styles.pasteInput}
                  />
                  <Pressable
                    onPress={handleImportPasted}
                    disabled={!pastedManifest.trim()}
                    style={({ pressed }) => [
                      touchTarget,
                      styles.pasteImportBtn,
                      !pastedManifest.trim() && styles.pasteImportBtnDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.pasteImportText}>Import Pasted Guests</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  manifestBtn: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.ice,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  manifestBtnText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  iticketBtn: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 11,
  },
  iticketBtnText: { color: colors.ice, fontSize: 13, fontWeight: '800' },
  sheetNotesImportBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sheetNotesImportText: { color: colors.ice, fontSize: 12, fontWeight: '800' },
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
  checkedCountPill: {
    backgroundColor: colors.successDarkBg,
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  checkedCountText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  resetText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  mismatchBanner: {
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mismatchText: { color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  guestList: { gap: 6 },
  guestRowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  guestRowCardChecked: {
    borderColor: colors.success,
    backgroundColor: '#0E1C14',
  },
  guestCompactRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  checkBtn: { padding: 2 },
  guestTapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  guestMainCol: { flex: 1 },
  guestNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guestName: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  guestNameChecked: { color: colors.success },
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
  callBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandChevron: { padding: 2 },
  medPill: {
    maxWidth: 95,
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
  modalHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  pickFileBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.ice,
    borderRadius: 12,
    minHeight: 48,
  },
  pickFileBtnText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  noticeBox: {
    backgroundColor: colors.warningDarkBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  noticeText: { color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  modalSubHeading: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  pasteInput: {
    minHeight: 105,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#09090B',
    color: colors.text,
    fontSize: 13,
    padding: 10,
  },
  pasteImportBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 46,
  },
  pasteImportBtnDisabled: { opacity: 0.45 },
  pasteImportText: { color: colors.background, fontSize: 15, fontWeight: '800' },
  sheetChoiceCard: {
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  sheetChoiceCardMatch: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDarkBg,
  },
  sheetChoiceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sheetChoiceTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sheetChoiceSub: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  matchPill: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  matchPillText: { color: colors.background, fontSize: 10, fontWeight: '900' },
  pressed: { opacity: 0.75 },
});