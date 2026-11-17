import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  Plus,
  Send,
  X,
} from 'lucide-react-native';

import {
  buildPrefilledReportUrl,
  FORM_TRIP_OPTIONS,
  matchFormTripOption,
  submitOrQueueTripReport,
  type FormTripOption,
  type TripReportPayload,
} from '../services/tripReportService';
import { colors, touchTarget } from '../theme';

interface Props {
  visible: boolean;
  tourKey: string;
  dateIso: string;
  guideName: string;
  tripName: string;
  initialPax: number;
  isHillHike: boolean;
  hillHikeLocation: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TripReportModal({
  visible,
  tourKey,
  dateIso,
  guideName,
  tripName,
  initialPax,
  isHillHike,
  hillHikeLocation,
  onClose,
  onSubmitted,
}: Props) {
  const [attendedPax, setAttendedPax] = useState(initialPax);
  const [selectedTrip, setSelectedTrip] = useState<FormTripOption>('Other');
  const [otherTripText, setOtherTripText] = useState('');
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [selectedPeak, setSelectedPeak] = useState(hillHikeLocation);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      const matched = matchFormTripOption(tripName, isHillHike);
      setSelectedTrip(matched);
      setOtherTripText(matched === 'Other' ? tripName : '');
      setShowTripPicker(false);
      setAttendedPax(initialPax);
      setSelectedPeak(isHillHike ? hillHikeLocation : '');
      setNotes('');
    }
  }, [visible, tripName, isHillHike, initialPax, hillHikeLocation]);

  const buildPayload = (): TripReportPayload => ({
    tourKey,
    dateIso,
    guideName,
    tripOption: selectedTrip,
    otherTripText: selectedTrip === 'Other' ? otherTripText.trim() || tripName : undefined,
    attendedPax,
    hillHikeLocation: isHillHike ? selectedPeak : '',
    notes,
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { sentLive } = await submitOrQueueTripReport(buildPayload());
      onSubmitted();
      onClose();
      Alert.alert(
        sentLive ? 'Report Submitted' : 'Saved Offline',
        sentLive
          ? 'Your post-trip report was submitted to Google Forms.'
          : 'Could not connect right now — report saved offline and will auto-send on return.'
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenBrowser = async () => {
    const url = buildPrefilledReportUrl(buildPayload());
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open browser.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Post-Trip Report</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <X color={colors.text} size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Auto-filled metadata summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Date: </Text>
                {dateIso} · <Text style={styles.summaryLabel}>Guide: </Text>
                {guideName}
              </Text>
            </View>

            {/* Which Trip Radio Matcher */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>WHICH TRIP (GOOGLE FORM OPTION)</Text>
              <Pressable
                onPress={() => setShowTripPicker((v) => !v)}
                style={styles.selectedTripBox}
              >
                <View style={styles.selectedTripTextCol}>
                  <Text style={styles.selectedTripTitle}>{selectedTrip}</Text>
                  {selectedTrip !== 'Other' ? (
                    <Text style={styles.selectedTripSub}>Matched from schedule</Text>
                  ) : null}
                </View>
                {showTripPicker ? (
                  <ChevronUp color={colors.accent} size={20} />
                ) : (
                  <ChevronDown color={colors.textSecondary} size={20} />
                )}
              </Pressable>

              {showTripPicker ? (
                <View style={styles.tripPickerList}>
                  {FORM_TRIP_OPTIONS.map((opt) => {
                    const active = selectedTrip === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => {
                          setSelectedTrip(opt);
                          setShowTripPicker(false);
                        }}
                        style={[styles.tripOptionRow, active && styles.tripOptionRowActive]}
                      >
                        <Text style={[styles.tripOptionText, active && styles.tripOptionTextActive]}>
                          {opt}
                        </Text>
                        {active ? <Check color={colors.accent} size={18} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {selectedTrip === 'Other' ? (
                <TextInput
                  value={otherTripText}
                  onChangeText={setOtherTripText}
                  placeholder="Specify custom trip name..."
                  placeholderTextColor={colors.textSecondary}
                  style={styles.otherInput}
                />
              ) : null}
            </View>

            {/* Attended Customers Stepper */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>CUSTOMERS THAT JOINED (EXCLUDE NO-SHOWS)</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => setAttendedPax((p) => Math.max(0, p - 1))}
                  style={({ pressed }) => [touchTarget, styles.stepBtn, pressed && styles.pressed]}
                >
                  <Minus color={colors.text} size={22} />
                </Pressable>
                <Text style={styles.paxValue}>{attendedPax}</Text>
                <Pressable
                  onPress={() => setAttendedPax((p) => p + 1)}
                  style={({ pressed }) => [touchTarget, styles.stepBtn, pressed && styles.pressed]}
                >
                  <Plus color={colors.text} size={22} />
                </Pressable>
              </View>
            </View>

            {/* Optional Hill Hike Mountain */}
            {isHillHike ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>HILL HIKE LOCATION (OPTIONAL)</Text>
                <View style={styles.peakRow}>
                  {['Tverrfjellet', 'Rundfjellet'].map((peak) => {
                    const active = selectedPeak.toLowerCase().includes(peak.toLowerCase().slice(0, 5));
                    return (
                      <Pressable
                        key={peak}
                        onPress={() => setSelectedPeak(active ? '' : peak)}
                        style={[
                          touchTarget,
                          styles.peakPill,
                          active && styles.peakPillActive,
                        ]}
                      >
                        <Text style={[styles.peakText, active && styles.peakTextActive]}>
                          {peak}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Trip Notes */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>TRIP NOTES / CONDITIONS / BROKEN GEAR</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. All good, slippery tracks, 1 no-show, broken pole..."
                placeholderTextColor={colors.textSecondary}
                style={styles.notesInput}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={({ pressed }) => [touchTarget, styles.submitBtn, pressed && styles.pressed]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <>
                  <Send color={colors.background} size={20} />
                  <Text style={styles.submitText}>Submit Trip Report</Text>
                </>
              )}
            </Pressable>

            {/* Browser Fallback */}
            <Pressable
              onPress={() => void handleOpenBrowser()}
              style={({ pressed }) => [touchTarget, styles.browserBtn, pressed && styles.pressed]}
            >
              <ExternalLink color={colors.textSecondary} size={18} />
              <Text style={styles.browserText}>Open Pre-Filled in Browser</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopColor: colors.accent,
    borderTopWidth: 2,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  summaryBox: {
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  summaryLine: { color: colors.text, fontSize: 14, fontWeight: '600' },
  summaryLabel: { color: colors.textSecondary, fontWeight: '800' },
  field: { gap: 6 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  selectedTripBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#09090B',
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedTripTextCol: { flex: 1, gap: 2 },
  selectedTripTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  selectedTripSub: { color: colors.accentSoft, fontSize: 11, fontWeight: '600' },
  tripPickerList: {
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  tripOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomColor: '#18181B',
    borderBottomWidth: 1,
  },
  tripOptionRowActive: {
    backgroundColor: colors.accentDarkBg,
  },
  tripOptionText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  tripOptionTextActive: { color: colors.text, fontWeight: '800' },
  otherInput: {
    minHeight: 44,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
    marginTop: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 60,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  paxValue: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  peakRow: { flexDirection: 'row', gap: 8 },
  peakPill: {
    flex: 1,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
  },
  peakPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  peakText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  peakTextActive: { color: colors.background },
  notesInput: {
    minHeight: 100,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    fontSize: 16,
  },
  submitBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: 16,
  },
  submitText: { color: colors.background, fontSize: 17, fontWeight: '800' },
  browserBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#09090B',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  browserText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});