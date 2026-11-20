import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { CONFIG } from '../config';
import {
  getRouteById,
  matchRouteForText,
  type ActivityRoute,
} from '../data/routes';
import {
  calculateDutyStatus,
  downloadSchedule,
  findUpcomingDaysOff,
  getCachedSchedule,
  getGuideProfile,
  isGuideProfileConfigured,
  parseGuideAssignments,
  saveGuideProfile,
  type DutyStatus,
  type GuideAssignment,
  type GuideProfile,
  type SyncPayload,
  type UpcomingDayOff,
} from '../services/googleSheetsService';
import {
  dismissManagerNote,
  loadDismissedNoteIds,
  parseManagerNotes,
  type ManagerNoteItem,
} from '../services/managerNotesService';
import {
  scheduleTomorrowDispatchNotification,
  syncTripReportNotifications,
} from '../services/notificationService';
import {
  flushQueuedTripReports,
  loadSubmittedReports,
  type SubmittedTripReportRecord,
} from '../services/tripReportService';
import { osloDateKey } from '../utils/format';

const AUTO_SYNC_MAX_AGE_MS = 30 * 60 * 1000;

function getOsloMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}

export function pickClosestAssignmentIndex(
  assignments: GuideAssignment[],
  now: Date
): number {
  if (assignments.length === 0) return -1;
  if (assignments.length === 1) return 0;

  const nowMin = getOsloMinutesOfDay(now);

  const activeIdx = assignments.findIndex((a) => {
    if (a.startMinutes === null) return false;
    const end = a.endMinutes ?? a.startMinutes + 180;
    return nowMin >= a.startMinutes - 30 && nowMin <= end;
  });
  if (activeIdx !== -1) return activeIdx;

  let bestUpcomingIdx = -1;
  let bestStart = Infinity;
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (!a) continue;
    const start = a.startMinutes ?? 600;
    const end = a.endMinutes ?? start + 180;
    if (end > nowMin && start < bestStart) {
      bestStart = start;
      bestUpcomingIdx = i;
    }
  }
  if (bestUpcomingIdx !== -1) return bestUpcomingIdx;

  return assignments.length - 1;
}

export interface ActiveTourContextValue {
  setupChecked: boolean;
  needsSetup: boolean;
  profile: GuideProfile;
  syncData: SyncPayload | null;
  syncing: boolean;
  statusMsg: string;
  selectedDate: Date;
  assignments: GuideAssignment[];
  targetRowIdx: number;
  dutyStatus: DutyStatus;
  upcomingDaysOff: UpcomingDayOff[];
  managerNotes: ManagerNoteItem[];
  submittedReports: Record<string, SubmittedTripReportRecord>;
  selectedAssignmentIdx: number;
  closestAssignmentIdx: number;
  activeAssignment: GuideAssignment | null;
  activeRoute: ActivityRoute;
  manualRouteId: string | null;
  isManualTripView: boolean;
  tourKey: string;
  selectAssignment: (idx: number) => void;
  selectManualRoute: (routeId: string | null) => void;
  setHillHikeMountain: (mountainId: 'tverrfjellet' | 'rundfjellet') => void;
  shiftDate: (days: number) => void;
  resetToToday: () => void;
  syncNow: () => Promise<void>;
  reloadProfileAndCache: () => Promise<void>;
  completeInitialSetup: (newProfile: GuideProfile) => Promise<void>;
  dismissNote: (id: string) => Promise<void>;
  refreshReports: () => Promise<void>;
}

const DEFAULT_PROFILE: GuideProfile = {
  initials: CONFIG.defaults.guideInitials,
  fullName: CONFIG.defaults.guideFullName,
  contractType: CONFIG.defaults.contractType,
  defaultMountain: CONFIG.defaults.defaultMountain,
};

const ActiveTourContext = createContext<ActiveTourContextValue | null>(null);

export function ActiveTourProvider({ children }: { children: ReactNode }) {
  const [setupChecked, setSetupChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [profile, setProfile] = useState<GuideProfile>(DEFAULT_PROFILE);
  const [syncData, setSyncData] = useState<SyncPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Ready to sync');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedAssignmentIdx, setSelectedAssignmentIdx] = useState<number>(0);
  const [manualRouteId, setManualRouteId] = useState<string | null>(null);
  const [mountainOverrides, setMountainOverrides] = useState<
    Record<string, 'tverrfjellet' | 'rundfjellet'>
  >({});
  const [dismissedNoteIds, setDismissedNoteIds] = useState<string[]>([]);
  const [submittedReports, setSubmittedReports] = useState<
    Record<string, SubmittedTripReportRecord>
  >({});

  const autoSyncingRef = useRef(false);

  const refreshReports = useCallback(async () => {
    const reports = await loadSubmittedReports();
    setSubmittedReports(reports);
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setStatusMsg('Downloading schedule from Google...');
    try {
      const freshProfile = await getGuideProfile();
      setProfile(freshProfile);
      const fresh = await downloadSchedule();
      setSyncData(fresh);
      setStatusMsg(
        `Synced ${fresh.values.length} rows & ${fresh.comments.length} comments.`
      );
      const flushed = await flushQueuedTripReports();
      if (flushed > 0) {
        await refreshReports();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setStatusMsg(`Sync error: ${msg}`);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [refreshReports]);

  const maybeAutoSync = useCallback(
    async (cached: SyncPayload | null, configured: boolean) => {
      if (!configured || autoSyncingRef.current) return;
      const lastMs = cached?.syncedAt ? Date.parse(cached.syncedAt) : 0;
      const isStale = !Number.isFinite(lastMs) || Date.now() - lastMs > AUTO_SYNC_MAX_AGE_MS;
      if (!isStale) return;

      autoSyncingRef.current = true;
      try {
        await syncNow();
      } catch {
        // Offline at trailhead: keep cached schedule quietly
      } finally {
        autoSyncingRef.current = false;
      }
    },
    [syncNow]
  );

  const reloadProfileAndCache = useCallback(async () => {
    const [configured, p, cached, dismissed, reports] = await Promise.all([
      isGuideProfileConfigured(),
      getGuideProfile(),
      getCachedSchedule(),
      loadDismissedNoteIds(),
      loadSubmittedReports(),
    ]);
    setNeedsSetup(!configured);
    setSetupChecked(true);
    setProfile(p);
    setDismissedNoteIds(dismissed);
    setSubmittedReports(reports);
    if (cached) {
      setSyncData(cached);
      setStatusMsg(`Offline ready (${cached.values.length} rows cached)`);
    } else {
      setStatusMsg('No schedule cached yet. Tap Sync.');
    }

    void maybeAutoSync(cached, configured);

    void flushQueuedTripReports().then((flushed) => {
      if (flushed > 0) {
        void loadSubmittedReports().then(setSubmittedReports);
      }
    });
  }, [maybeAutoSync]);

  useEffect(() => {
    void reloadProfileAndCache();
  }, [reloadProfileAndCache]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !needsSetup) {
        void getCachedSchedule().then((cached) => maybeAutoSync(cached, true));
      }
    });
    return () => sub.remove();
  }, [needsSetup, maybeAutoSync]);

  const completeInitialSetup = useCallback(
    async (newProfile: GuideProfile) => {
      await saveGuideProfile(newProfile);
      setProfile(newProfile);
      setNeedsSetup(false);
      setSetupChecked(true);
      try {
        await syncNow();
      } catch {}
    },
    [syncNow]
  );

  const parsed = useMemo(() => {
    if (!syncData) {
      return { assignments: [] as GuideAssignment[], targetRowIdx: -1 };
    }
    return parseGuideAssignments(
      syncData.values,
      syncData.notes,
      syncData.comments,
      syncData.backgrounds,
      syncData.fontLines,
      profile.initials,
      selectedDate
    );
  }, [syncData, profile.initials, selectedDate]);

  useEffect(() => {
    if (needsSetup) return;
    void syncTripReportNotifications(parsed.assignments, submittedReports, selectedDate);
  }, [parsed.assignments, submittedReports, selectedDate, needsSetup]);

  useEffect(() => {
    if (needsSetup || !syncData) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const { assignments: tmrAssignments, targetRowIdx: tmrRow } = parseGuideAssignments(
      syncData.values,
      syncData.notes,
      syncData.comments,
      syncData.backgrounds,
      syncData.fontLines,
      profile.initials,
      tomorrow
    );
    const tmrDuty = calculateDutyStatus(
      syncData.values,
      tmrRow,
      profile,
      tmrAssignments.length
    );
    void scheduleTomorrowDispatchNotification({
      tomorrowDate: tomorrow,
      tomorrowAssignments: tmrAssignments,
      tomorrowDuty: tmrDuty,
    });
  }, [syncData, profile, needsSetup]);

  const closestAssignmentIdx = useMemo(() => {
    if (parsed.assignments.length === 0) return -1;
    const todayKey = osloDateKey(new Date());
    const selKey = osloDateKey(selectedDate);
    if (todayKey === selKey) {
      return pickClosestAssignmentIndex(parsed.assignments, new Date());
    }
    return 0;
  }, [parsed.assignments, selectedDate]);

  useEffect(() => {
    if (parsed.assignments.length === 0) {
      setSelectedAssignmentIdx(0);
      return;
    }
    setSelectedAssignmentIdx(closestAssignmentIdx >= 0 ? closestAssignmentIdx : 0);
  }, [parsed.assignments.length, closestAssignmentIdx]);

  const dutyStatus: DutyStatus = useMemo(() => {
    if (!syncData) {
      return {
        type: 'base',
        title: 'Not Synced Yet',
        detail: 'Tap Sync to download dispatch from Google Sheets.',
      };
    }
    return calculateDutyStatus(
      syncData.values,
      parsed.targetRowIdx,
      profile,
      parsed.assignments.length
    );
  }, [syncData, parsed.targetRowIdx, parsed.assignments.length, profile]);

  const upcomingDaysOff: UpcomingDayOff[] = useMemo(() => {
    if (!syncData) return [];
    return findUpcomingDaysOff(
      syncData.values,
      syncData.notes,
      syncData.comments,
      syncData.backgrounds,
      syncData.fontLines,
      profile,
      new Date(),
      14
    );
  }, [syncData, profile]);

  const managerNotes: ManagerNoteItem[] = useMemo(() => {
    if (!syncData) return [];
    const all = parseManagerNotes(syncData.managerNotes, new Date());
    return all.filter((n) => n.level === 'critical' || !dismissedNoteIds.includes(n.id));
  }, [syncData, dismissedNoteIds]);

  const isManualTripView = manualRouteId !== null;

  const activeAssignment: GuideAssignment | null = isManualTripView
    ? null
    : parsed.assignments[selectedAssignmentIdx] ?? null;

  const dayKey = useMemo(() => osloDateKey(selectedDate), [selectedDate]);

  const activeRoute: ActivityRoute = useMemo(() => {
    if (manualRouteId) {
      return getRouteById(manualRouteId);
    }
    if (activeAssignment) {
      if (activeAssignment.tourCategory === 'hill_hike') {
        const override = mountainOverrides[dayKey];
        if (override) {
          return getRouteById(override);
        }
      }
      const textBlob = [
        activeAssignment.tourName,
        activeAssignment.rawText,
        activeAssignment.cellNote ?? '',
        ...activeAssignment.commentsList.map((c) => c.content),
      ].join(' ');
      return matchRouteForText(
        activeAssignment.tourCategory,
        textBlob,
        profile.defaultMountain
      );
    }
    return getRouteById(
      profile.defaultMountain === 'rundfjellet' ? 'rundfjellet' : 'tverrfjellet'
    );
  }, [manualRouteId, activeAssignment, mountainOverrides, dayKey, profile.defaultMountain]);

  const tourKey = useMemo(() => {
    if (isManualTripView && manualRouteId) {
      return `ref_${manualRouteId}`;
    }
    if (activeAssignment) {
      return `${dayKey}_${activeAssignment.tourName.replace(/\s+/g, '_')}_${selectedAssignmentIdx}`;
    }
    return `free_${dayKey}`;
  }, [isManualTripView, manualRouteId, dayKey, activeAssignment, selectedAssignmentIdx]);

  const selectAssignment = useCallback((idx: number) => {
    setManualRouteId(null);
    setSelectedAssignmentIdx(idx);
  }, []);

  const selectManualRoute = useCallback((routeId: string | null) => {
    setManualRouteId(routeId);
  }, []);

  const setHillHikeMountain = useCallback(
    (mountainId: 'tverrfjellet' | 'rundfjellet') => {
      setManualRouteId(null);
      setMountainOverrides((prev) => ({ ...prev, [dayKey]: mountainId }));
    },
    [dayKey]
  );

  const shiftDate = useCallback((days: number) => {
    setManualRouteId(null);
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  }, []);

  const resetToToday = useCallback(() => {
    setManualRouteId(null);
    setSelectedDate(new Date());
  }, []);

  const dismissNote = useCallback(async (id: string) => {
    const next = await dismissManagerNote(id);
    setDismissedNoteIds(next);
  }, []);

  const value: ActiveTourContextValue = {
    setupChecked,
    needsSetup,
    profile,
    syncData,
    syncing,
    statusMsg,
    selectedDate,
    assignments: parsed.assignments,
    targetRowIdx: parsed.targetRowIdx,
    dutyStatus,
    upcomingDaysOff,
    managerNotes,
    submittedReports,
    selectedAssignmentIdx,
    closestAssignmentIdx,
    activeAssignment,
    activeRoute,
    manualRouteId,
    isManualTripView,
    tourKey,
    selectAssignment,
    selectManualRoute,
    setHillHikeMountain,
    shiftDate,
    resetToToday,
    syncNow,
    reloadProfileAndCache,
    completeInitialSetup,
    dismissNote,
    refreshReports,
  };

  return (
    <ActiveTourContext.Provider value={value}>
      {children}
    </ActiveTourContext.Provider>
  );
}

export function useActiveTour(): ActiveTourContextValue {
  const ctx = useContext(ActiveTourContext);
  if (!ctx) {
    throw new Error('useActiveTour must be used inside ActiveTourProvider');
  }
  return ctx;
}