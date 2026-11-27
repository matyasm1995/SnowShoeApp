import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Calendar,
  CalendarPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  X,
} from 'lucide-react-native';

import {
  calculateDutyStatus,
  parseGuideAssignments,
  type GuideProfile,
  type SyncPayload,
} from '../services/googleSheetsService';
import { colors } from '../theme';
import { buildCalendarExportLinks } from '../utils/calendarExport';
import { osloDateKey } from '../utils/format';

interface Props {
  visible: boolean;
  selectedDate: Date;
  syncData: SyncPayload | null;
  profile: GuideProfile;
  onSelectDate: (date: Date) => void;
  onSelectToday: () => void;
  onClose: () => void;
}

type DayKind = 'tour' | 'off' | 'base' | 'none';

interface CalendarDayCell {
  key: string;
  date: Date;
  dayNum: number;
  inWindow: boolean;
  isToday: boolean;
  isSelected: boolean;
  kind: DayKind;
}

interface MonthBlock {
  key: string;
  title: string;
  weeks: (CalendarDayCell | null)[][];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const PAST_DAYS_WINDOW = 2;
const FUTURE_DAYS_WINDOW = 40;

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function makeNoonDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0);
}

export function ScheduleCalendarModal({
  visible,
  selectedDate,
  syncData,
  profile,
  onSelectDate,
  onSelectToday,
  onClose,
}: Props) {
  const todayKey = useMemo(() => osloDateKey(new Date()), []);
  const selectedKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);
  const [showExportView, setShowExportView] = useState(false);
  const [includeDaysOff, setIncludeDaysOff] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowExportView(false);
      setCopied(false);
    }
  }, [visible]);

  const exportLinks = useMemo(
    () => buildCalendarExportLinks(profile, includeDaysOff),
    [profile, includeDaysOff]
  );

  const monthBlocks = useMemo<MonthBlock[]>(() => {
    if (!visible) return [];

    const now = new Date();
    const baseNoon = makeNoonDate(now.getFullYear(), now.getMonth(), now.getDate());

    const minDate = new Date(baseNoon);
    minDate.setDate(minDate.getDate() - PAST_DAYS_WINDOW);
    const maxDate = new Date(baseNoon);
    maxDate.setDate(maxDate.getDate() + FUTURE_DAYS_WINDOW);

    const minKey = osloDateKey(minDate);
    const maxKey = osloDateKey(maxDate);

    // Precompute schedule status for each synced day in window
    const statusByKey = new Map<string, DayKind>();
    if (syncData) {
      for (let offset = -PAST_DAYS_WINDOW; offset <= FUTURE_DAYS_WINDOW; offset++) {
        const d = new Date(baseNoon);
        d.setDate(d.getDate() + offset);
        const key = osloDateKey(d);
        const { assignments, targetRowIdx } = parseGuideAssignments(
          syncData.values,
          syncData.notes,
          syncData.comments,
          syncData.backgrounds,
          syncData.fontLines,
          profile.initials,
          d
        );
        if (targetRowIdx === -1) {
          statusByKey.set(key, 'none');
        } else if (assignments.length > 0) {
          statusByKey.set(key, 'tour');
        } else {
          const duty = calculateDutyStatus(syncData.values, targetRowIdx, profile, 0);
          statusByKey.set(key, duty.type === 'day_off' ? 'off' : 'base');
        }
      }
    }

    // Collect distinct months spanned by [minDate, maxDate]
    const months: { year: number; month: number }[] = [];
    let cursorY = minDate.getFullYear();
    let cursorM = minDate.getMonth();
    const endY = maxDate.getFullYear();
    const endM = maxDate.getMonth();
    while (cursorY < endY || (cursorY === endY && cursorM <= endM)) {
      months.push({ year: cursorY, month: cursorM });
      cursorM += 1;
      if (cursorM > 11) {
        cursorM = 0;
        cursorY += 1;
      }
    }

    const blocks: MonthBlock[] = [];

    for (const { year, month } of months) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstInWindowDay =
        year === minDate.getFullYear() && month === minDate.getMonth()
          ? minDate.getDate()
          : 1;
      const lastInWindowDay =
        year === maxDate.getFullYear() && month === maxDate.getMonth()
          ? maxDate.getDate()
          : daysInMonth;

      // Start on the Monday of the first visible week in this month
      const firstDate = makeNoonDate(year, month, firstInWindowDay);
      const startDay = Math.max(1, firstInWindowDay - mondayIndex(firstDate));
      // End on the Sunday of the last visible week in this month
      const lastDate = makeNoonDate(year, month, lastInWindowDay);
      const endDay = Math.min(daysInMonth, lastInWindowDay + (6 - mondayIndex(lastDate)));

      const weeks: (CalendarDayCell | null)[][] = [];
      let currentWeek: (CalendarDayCell | null)[] = [];

      const leadingBlanks = mondayIndex(makeNoonDate(year, month, startDay));
      for (let b = 0; b < leadingBlanks; b++) {
        currentWeek.push(null);
      }

      for (let day = startDay; day <= endDay; day++) {
        const d = makeNoonDate(year, month, day);
        const key = osloDateKey(d);
        const inWindow = key >= minKey && key <= maxKey;
        const kind = inWindow ? statusByKey.get(key) ?? 'none' : 'none';

        currentWeek.push({
          key,
          date: d,
          dayNum: day,
          inWindow,
          isToday: key === todayKey,
          isSelected: key === selectedKey,
          kind,
        });

        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }

      if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
      }

      const title = makeNoonDate(year, month, 1).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });

      blocks.push({
        key: `${year}-${month}`,
        title,
        weeks,
      });
    }

    return blocks;
  }, [visible, syncData, profile, todayKey, selectedKey]);

  const handlePick = (date: Date) => {
    onSelectDate(date);
    onClose();
  };

  const handleToday = () => {
    onSelectToday();
    onClose();
  };

  const handleSubscribeApple = async () => {
    if (!exportLinks) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = exportLinks.webcalUrl;
        return;
      }
      await Linking.openURL(exportLinks.webcalUrl);
    } catch {
      Alert.alert(
        'Could Not Open Calendar',
        'Your device did not open webcal:// directly. Use "Download .ics File" or copy the link for Google Calendar.'
      );
    }
  };

  const handleCopyOrShareLink = async () => {
    if (!exportLinks) return;
    const url = exportLinks.httpsUrl;

    if (Platform.OS === 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else if (typeof document !== 'undefined') {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        window.alert(`Copy this calendar link:\n\n${url}`);
      }
      return;
    }

    try {
      await Share.share({
        title: 'TO Work Schedule Calendar',
        message: url,
      });
    } catch {}
  };

  const handleOpenGoogleCalendar = async () => {
    if (!exportLinks) return;
    try {
      await Linking.openURL(exportLinks.googleCalendarAddUrl);
    } catch {
      Alert.alert(
        'Open Google Calendar',
        'Copy the calendar link and add it in Google Calendar (web) under Other calendars (+) → From URL.'
      );
    }
  };

  const handleDownloadIcs = async () => {
    if (!exportLinks) return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = exportLinks.downloadUrl;
        return;
      }
      await Linking.openURL(exportLinks.downloadUrl);
    } catch {
      Alert.alert('Download Failed', 'Could not open the .ics download link.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        if (showExportView) {
          setShowExportView(false);
        } else {
          onClose();
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {showExportView ? (
                <Pressable
                  onPress={() => setShowExportView(false)}
                  hitSlop={10}
                  style={styles.backBtn}
                >
                  <ArrowLeft color={colors.text} size={20} />
                </Pressable>
              ) : (
                <Calendar color={colors.accent} size={18} />
              )}
              <Text style={styles.title}>
                {showExportView ? 'Sync to Calendar' : 'Choose Date'}
              </Text>
            </View>
            <View style={styles.headerRight}>
              {!showExportView && (
                <Pressable
                  onPress={handleToday}
                  style={({ pressed }) => [styles.todayBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.todayBtnText}>Today</Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <X color={colors.text} size={22} />
              </Pressable>
            </View>
          </View>

          {showExportView ? (
            <ScrollView contentContainerStyle={styles.exportBody}>
              <Text style={styles.exportIntro}>
                Sync your Working &amp; Day Off schedule for the next 90 days as clean all-day
                events (no shifting tour times). Updates automatically from Sheet 1.6.
              </Text>

              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => {
                    setIncludeDaysOff(true);
                    setCopied(false);
                  }}
                  style={[
                    styles.toggleChip,
                    includeDaysOff && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      includeDaysOff && styles.toggleChipTextActive,
                    ]}
                  >
                    Working + Days Off
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setIncludeDaysOff(false);
                    setCopied(false);
                  }}
                  style={[
                    styles.toggleChip,
                    !includeDaysOff && styles.toggleChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleChipText,
                      !includeDaysOff && styles.toggleChipTextActive,
                    ]}
                  >
                    Working Days Only
                  </Text>
                </Pressable>
              </View>

              {!exportLinks ? (
                <View style={styles.exportCard}>
                  <Text style={styles.exportCardTitle}>Guide Profile Needed</Text>
                  <Text style={styles.exportHint}>
                    Set your initials and name in the Settings tab first so we can build your
                    personal schedule feed.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Apple Calendar (iPhone / Mac) */}
                  <View style={styles.exportCard}>
                    <Text style={styles.exportCardTitle}>iPhone / Apple Calendar (Auto-Sync)</Text>
                    <Text style={styles.exportHint}>
                      Subscribes directly in Apple Calendar and refreshes automatically.
                    </Text>
                    <Pressable
                      onPress={handleSubscribeApple}
                      style={({ pressed }) => [
                        styles.exportPrimaryBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <CalendarPlus color={colors.background} size={17} />
                      <Text style={styles.exportPrimaryBtnText}>
                        Subscribe in Apple Calendar
                      </Text>
                    </Pressable>
                  </View>

                  {/* Google Calendar (Android / Web) */}
                  <View style={styles.exportCard}>
                    <Text style={styles.exportCardTitle}>Google Calendar (Auto-Sync)</Text>
                    <Text style={styles.exportHint}>
                      In Google Calendar (web), click Other calendars (+) → From URL → paste this
                      link. It then syncs automatically to your Android phone.
                    </Text>
                    <View style={styles.urlBox}>
                      <Text selectable style={styles.urlText} numberOfLines={2}>
                        {exportLinks.httpsUrl}
                      </Text>
                    </View>
                    <View style={styles.exportBtnRow}>
                      <Pressable
                        onPress={handleCopyOrShareLink}
                        style={({ pressed }) => [
                          styles.exportIceBtn,
                          styles.exportFlexBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        {copied ? (
                          <Check color={colors.ice} size={16} />
                        ) : (
                          <Copy color={colors.ice} size={16} />
                        )}
                        <Text style={styles.exportIceBtnText}>
                          {copied
                            ? 'Link Copied!'
                            : Platform.OS === 'web'
                              ? 'Copy Link'
                              : 'Copy / Share Link'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={handleOpenGoogleCalendar}
                        style={({ pressed }) => [
                          styles.exportGhostBtn,
                          pressed && styles.pressed,
                        ]}
                      >
                        <ExternalLink color={colors.textSecondary} size={15} />
                        <Text style={styles.exportGhostBtnText}>Google Cal</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* One-Time Download */}
                  <Pressable
                    onPress={handleDownloadIcs}
                    style={({ pressed }) => [
                      styles.exportDownloadBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Download color={colors.textSecondary} size={16} />
                    <Text style={styles.exportDownloadBtnText}>
                      Download .ics File (One-Time Import)
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          ) : (
            <>
              <View style={styles.weekdayRow}>
                {WEEKDAYS.map((wd) => (
                  <Text key={wd} style={styles.weekdayLabel}>
                    {wd}
                  </Text>
                ))}
              </View>

              <ScrollView contentContainerStyle={styles.body}>
                {monthBlocks.map((block) => (
                  <View key={block.key} style={styles.monthSection}>
                    <Text style={styles.monthTitle}>{block.title}</Text>
                    {block.weeks.map((week, wIdx) => (
                      <View key={`${block.key}-w-${wIdx}`} style={styles.weekRow}>
                        {week.map((cell, cIdx) => {
                          if (!cell) {
                            return (
                              <View key={`blank-${wIdx}-${cIdx}`} style={styles.dayCellEmpty} />
                            );
                          }

                          const dotColor =
                            cell.kind === 'tour'
                              ? cell.isSelected
                                ? colors.background
                                : colors.accent
                              : cell.kind === 'off'
                                ? cell.isSelected
                                  ? colors.background
                                  : colors.success
                                : cell.kind === 'base'
                                  ? cell.isSelected
                                    ? colors.background
                                    : colors.warning
                                  : null;

                          return (
                            <Pressable
                              key={cell.key}
                              disabled={!cell.inWindow}
                              onPress={() => handlePick(cell.date)}
                              style={({ pressed }) => [
                                styles.dayCell,
                                cell.isToday && !cell.isSelected && styles.dayCellToday,
                                cell.isSelected && styles.dayCellSelected,
                                !cell.inWindow && styles.dayCellDisabled,
                                pressed && cell.inWindow && styles.pressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayNumber,
                                  cell.isToday && !cell.isSelected && styles.dayNumberToday,
                                  cell.isSelected && styles.dayNumberSelected,
                                  !cell.inWindow && styles.dayNumberDisabled,
                                ]}
                              >
                                {cell.dayNum}
                              </Text>
                              <View
                                style={[
                                  styles.dot,
                                  dotColor ? { backgroundColor: dotColor } : styles.dotHidden,
                                ]}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>

              <View style={styles.footer}>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                    <Text style={styles.legendText}>Tour</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                    <Text style={styles.legendText}>Day Off</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                    <Text style={styles.legendText}>Base</Text>
                  </View>
                </View>
                <Text style={styles.footerHint}>Synced window: 2 days back – 40 days ahead</Text>
                <Pressable
                  onPress={() => setShowExportView(true)}
                  style={({ pressed }) => [styles.syncFooterBtn, pressed && styles.pressed]}
                >
                  <CalendarPlus color={colors.ice} size={15} />
                  <Text style={styles.syncFooterBtnText}>
                    Sync / Export to Google or iPhone Calendar
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    maxHeight: '84%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  todayBtn: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  todayBtnText: {
    color: colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  closeBtn: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  body: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 16,
  },
  monthSection: {
    gap: 6,
  },
  monthTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCellEmpty: {
    flex: 1,
    height: 44,
  },
  dayCell: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0E1116',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  dayCellToday: {
    borderColor: colors.ice,
    backgroundColor: colors.iceDarkBg,
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayCellDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    opacity: 0.3,
  },
  dayNumber: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dayNumberToday: {
    color: colors.ice,
    fontWeight: '900',
  },
  dayNumberSelected: {
    color: colors.background,
    fontWeight: '900',
  },
  dayNumberDisabled: {
    color: colors.textSecondary,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotHidden: {
    backgroundColor: 'transparent',
  },
  footer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  footerHint: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  syncFooterBtn: {
    marginTop: 4,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  syncFooterBtnText: {
    color: colors.ice,
    fontSize: 13,
    fontWeight: '800',
  },
  backBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  exportIntro: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#0E1116',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  toggleChipActive: {
    backgroundColor: colors.accentDarkBg,
    borderColor: colors.accent,
  },
  toggleChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  toggleChipTextActive: {
    color: colors.accentSoft,
  },
  exportCard: {
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    gap: 8,
  },
  exportCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  exportHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  urlBox: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  urlText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  exportPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  exportPrimaryBtnText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: '900',
  },
  exportBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  exportFlexBtn: {
    flex: 1,
  },
  exportIceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.iceDarkBg,
    borderColor: colors.ice,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  exportIceBtnText: {
    color: colors.ice,
    fontSize: 13,
    fontWeight: '800',
  },
  exportGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  exportGhostBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  exportDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0E1116',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  exportDownloadBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
