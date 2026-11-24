import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, X } from 'lucide-react-native';

import {
  calculateDutyStatus,
  parseGuideAssignments,
  type GuideProfile,
  type SyncPayload,
} from '../services/googleSheetsService';
import { colors } from '../theme';
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Calendar color={colors.accent} size={18} />
              <Text style={styles.title}>Choose Date</Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                onPress={handleToday}
                style={({ pressed }) => [styles.todayBtn, pressed && styles.pressed]}
              >
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <X color={colors.text} size={22} />
              </Pressable>
            </View>
          </View>

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
                        return <View key={`blank-${wIdx}-${cIdx}`} style={styles.dayCellEmpty} />;
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
          </View>
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
  pressed: {
    opacity: 0.72,
  },
});
