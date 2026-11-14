import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  MessageSquare,
  Palmtree,
  RefreshCw,
} from 'lucide-react-native';

import { colors, sharedStyles, touchTarget } from '../theme';
import {
  calculateDutyStatus,
  downloadSchedule,
  getCachedSchedule,
  getGuideProfile,
  parseGuideAssignments,
  type DutyStatus,
  type GuideAssignment,
  type GuideProfile,
  type SyncPayload,
} from '../services/googleSheetsService';

export function ScheduleSyncScreen() {
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [syncData, setSyncData] = useState<SyncPayload | null>(null);
  const [assignments, setAssignments] = useState<GuideAssignment[]>([]);
  const [dutyStatus, setDutyStatus] = useState<DutyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Ready to sync');

  useEffect(() => {
    void (async () => {
      const p = await getGuideProfile();
      setProfile(p);

      const cached = await getCachedSchedule();
      if (cached) {
        setSyncData(cached);
        const { assignments: parsed, targetRowIdx } = parseGuideAssignments(
          cached.values,
          cached.notes,
          cached.comments,
          p.initials,
          selectedDate
        );
        setAssignments(parsed);
        setDutyStatus(calculateDutyStatus(cached.values, targetRowIdx, p, parsed.length));
        setStatusMsg(`Offline ready (${cached.values.length} rows cached)`);
      } else {
        setStatusMsg('No schedule cached yet. Tap Sync below.');
        setDutyStatus({
          type: 'base',
          title: 'Not Synced Yet',
          detail: 'Tap the blue Sync button above to download dispatch.',
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (syncData && profile) {
      const { assignments: parsed, targetRowIdx } = parseGuideAssignments(
        syncData.values,
        syncData.notes,
        syncData.comments,
        profile.initials,
        selectedDate
      );
      setAssignments(parsed);
      setDutyStatus(calculateDutyStatus(syncData.values, targetRowIdx, profile, parsed.length));
    }
  }, [selectedDate, profile, syncData]);

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

  const handleSync = async () => {
    if (!profile) return;
    setLoading(true);
    setStatusMsg('Downloading schedule from Google...');
    try {
      const fresh = await downloadSchedule();
      setSyncData(fresh);
      const { assignments: parsed, targetRowIdx } = parseGuideAssignments(
        fresh.values,
        fresh.notes,
        fresh.comments,
        profile.initials,
        selectedDate
      );
      setAssignments(parsed);
      setDutyStatus(calculateDutyStatus(fresh.values, targetRowIdx, profile, parsed.length));
      setStatusMsg(`Synced ${fresh.values.length} rows & ${fresh.comments.length} comments.`);
    } catch (err: any) {
      setStatusMsg(`Sync error: ${err.message}`);
      Alert.alert('Sync Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = selectedDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={sharedStyles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={handleSync}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <Text style={sharedStyles.sectionTitle}>Company Schedule</Text>
      <Text style={sharedStyles.secondary}>
        Schedule for {profile?.fullName || 'Guide'} ({profile?.initials || 'Mh'}) · {profile?.contractType === 'full-time' ? 'Full-Time' : 'Part-Time'}
      </Text>

      {/* 1. ALWAYS-VISIBLE SYNC CARD */}
      <View style={[sharedStyles.card, styles.syncCard]}>
        <View style={styles.syncLeft}>
          <Text style={styles.syncCardTitle}>Winter 2026-27 Dispatch</Text>
          <Text style={styles.syncCardDetail}>{statusMsg}</Text>
          {syncData ? (
            <Text style={styles.syncMeta}>
              Last Synced: {new Date(syncData.syncedAt).toLocaleTimeString()} ({syncData.fromCache ? 'Cache' : 'Live'})
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => void handleSync()}
          disabled={loading}
          style={({ pressed }) => [touchTarget, styles.syncBtn, pressed && styles.pressed]}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <RefreshCw color={colors.background} size={22} />
          )}
        </Pressable>
      </View>

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

      {/* 3. Duty Status Banner (Day Off vs Base Duty vs Tour) */}
      {dutyStatus ? (
        <View
          style={[
            styles.dutyCard,
            dutyStatus.type === 'day_off' && styles.dutyCardOff,
            dutyStatus.type === 'base' && styles.dutyCardBase,
            dutyStatus.type === 'tour' && styles.dutyCardTour,
          ]}
        >
          <View style={styles.dutyIconCol}>
            {dutyStatus.type === 'day_off' && <Palmtree color="#4ADE80" size={26} />}
            {dutyStatus.type === 'base' && <Briefcase color="#FACC15" size={26} />}
            {dutyStatus.type === 'tour' && <Calendar color="#38BDF8" size={26} />}
          </View>
          <View style={styles.dutyTextCol}>
            <Text
              style={[
                styles.dutyTitle,
                dutyStatus.type === 'day_off' && { color: '#4ADE80' },
                dutyStatus.type === 'base' && { color: '#FACC15' },
                dutyStatus.type === 'tour' && { color: '#38BDF8' },
              ]}
            >
              {dutyStatus.title}
            </Text>
            <Text style={styles.dutyDetail}>{dutyStatus.detail}</Text>
          </View>
        </View>
      ) : null}

      {/* 4. Assigned Tours List */}
      {assignments.length > 0 ? (
        <Text style={sharedStyles.sectionTitle}>
          Assigned Field Operations ({assignments.length})
        </Text>
      ) : null}

      {assignments.map((tour, idx) => (
        <View key={idx} style={[sharedStyles.card, styles.tourCard]}>
          <View style={styles.tourHeader}>
            <Text style={styles.tourCategory}>
              {tour.isCharter ? '🚢 GROUP CHARTER' : '🏔️ REGULAR TOUR'}
            </Text>
            {tour.vehicle ? (
              <View style={styles.vehicleBadge}>
                <Text style={styles.vehicleText}>{tour.vehicle}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.tourTitle}>{tour.tourName}</Text>
          <Text style={styles.tourRaw}>Cell text: "{tour.rawText}"</Text>

          <View style={styles.tourStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>GUESTS (PAX)</Text>
              <Text style={styles.statValue}>{tour.guestCount > 0 ? tour.guestCount : 'Open'}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>SPORT</Text>
              <Text style={[styles.statValue, { textTransform: 'capitalize' }]}>{tour.activity}</Text>
            </View>
          </View>

          {/* Threaded Comments & Replies */}
          {tour.commentsList && tour.commentsList.length > 0 ? (
            <View style={styles.commentSection}>
              {tour.commentsList.map((thread, tIdx) => (
                <View key={tIdx} style={styles.threadCard}>
                  <View style={styles.threadHeader}>
                    <MessageSquare color="#38BDF8" size={16} />
                    <Text style={styles.threadAuthor}>{thread.author}:</Text>
                  </View>
                  <Text style={styles.threadText}>{thread.content}</Text>

                  {thread.replies && thread.replies.length > 0 ? (
                    <View style={styles.repliesList}>
                      {thread.replies.map((reply, rIdx) => (
                        <View key={rIdx} style={styles.replyRow}>
                          <CornerDownRight color="#38BDF8" size={14} style={styles.replyIcon} />
                          <View style={styles.replyContent}>
                            <Text style={styles.replyAuthor}>{reply.author || 'Reply'}:</Text>
                            <Text style={styles.replyText}>{reply.content}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {tour.cellNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteTitle}>Cell Note:</Text>
              <Text style={styles.noteText}>{tour.cellNote}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  syncLeft: { flex: 1, gap: 4, paddingRight: 10 },
  syncCardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  syncCardDetail: { color: colors.textSecondary, fontSize: 14 },
  syncMeta: { color: colors.accent, fontSize: 12, marginTop: 2 },
  syncBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minWidth: 56,
    minHeight: 56,
  },
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
  statusMeta: { color: colors.textSecondary, fontSize: 12, paddingHorizontal: 4, marginTop: 4 },
  dutyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 8,
    gap: 12,
  },
  dutyCardOff: { backgroundColor: '#064E3B', borderColor: '#4ADE80' },
  dutyCardBase: { backgroundColor: '#422006', borderColor: '#FACC15' },
  dutyCardTour: { backgroundColor: '#0C4A6E', borderColor: '#38BDF8' },
  dutyIconCol: { justifyContent: 'center', alignItems: 'center' },
  dutyTextCol: { flex: 1, gap: 2 },
  dutyTitle: { fontSize: 17, fontWeight: '800' },
  dutyDetail: { color: colors.text, fontSize: 13 },
  tourCard: { gap: 10, borderColor: colors.accent, borderWidth: 1.5, marginTop: 10 },
  tourHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tourCategory: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  vehicleBadge: { backgroundColor: '#1E293B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  vehicleText: { color: '#38BDF8', fontSize: 13, fontWeight: '800' },
  tourTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  tourRaw: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  tourStatsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBox: { flex: 1, backgroundColor: '#09090B', borderRadius: 10, padding: 10 },
  statLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 2 },
  commentSection: { gap: 8, marginTop: 4 },
  threadCard: {
    backgroundColor: '#082F49',
    borderColor: '#0284C7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  threadAuthor: { color: '#38BDF8', fontSize: 13, fontWeight: '800' },
  threadText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  repliesList: {
    borderTopColor: '#0369A1',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
    gap: 8,
  },
  replyRow: { flexDirection: 'row', gap: 6, paddingLeft: 4 },
  replyIcon: { marginTop: 2 },
  replyContent: { flex: 1, gap: 2 },
  replyAuthor: { color: '#7DD3FC', fontSize: 12, fontWeight: '800' },
  replyText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  noteBox: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  noteTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  noteText: { color: colors.text, fontSize: 14 },
  pressed: { opacity: 0.75 },
});