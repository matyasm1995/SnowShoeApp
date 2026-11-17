import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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
  parseGuideAssignments,
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
  flushQueuedTripReports,
  loadSubmittedReports,
  type SubmittedTripReportRecord,
} from '../services/tripReportService';
import { osloDateKey } from '../utils/format';

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
  tourKey: string;
  selectAssignment: (idx: number) => void;
  selectManualRoute: (routeId: string | null) => void;
  setHillHikeMountain: (mountainId: 'tverrfjellet' | 'rundfjellet') => void;
  shiftDate: (days: number) => void;
  resetToToday: () => void;
  syncNow: () => Promise<void>;
  reloadProfileAndCache: () => Promise<void>;
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

  const refreshReports = useCallback(async () => {
    const reports = await loadSubmittedReports();
    setSubmittedReports(reports);
  }, []);

  const reloadProfileAndCache = useCallback(async () => {
    const [p, cached, dismissed, reports] = await Promise.all([
      getGuideProfile(),
      getCachedSchedule(),
      loadDismissedNoteIds(),
      loadSubmittedReports(),
    ]);
    setProfile(p);
    setDismissedNoteIds(dismissed);
    setSubmittedReports(reports);
    if (cached) {
      setSyncData(cached);
      setStatusMsg(`Offline ready (${cached.values.length} rows cached)`);
    } else {
      setStatusMsg('No schedule cached yet. Tap Sync.');
    }
    void flushQueuedTripReports().then((flushed) => {
      if (flushed > 0) {
        void loadSubmittedReports().then(setSubmittedReports);
      }
    });
  }, []);

  useEffect(() => {
    void reloadProfileAndCache();
  }, [reloadProfileAndCache]);

  const parsed = useMemo(() => {
    if (!syncData) {
      return { assignments: [] as GuideAssignment[], targetRowIdx: -1 };
    }
    return parseGuideAssignments(
      syncData.values,
      syncData.notes,
      syncData.comments,
      profile.initials,
      selectedDate
    );
  }, [syncData, profile.initials, selectedDate]);

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

  const activeAssignment: GuideAssignment | null =
    parsed.assignments[selectedAssignmentIdx] ?? null;

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
    if (activeAssignment) {
      return `${dayKey}_${activeAssignment.tourName.replace(/\s+/g, '_')}_${selectedAssignmentIdx}`;
    }
    return `free_${dayKey}`;
  }, [dayKey, activeAssignment, selectedAssignmentIdx]);

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

  const value: ActiveTourContextValue = {
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
    tourKey,
    selectAssignment,
    selectManualRoute,
    setHillHikeMountain,
    shiftDate,
    resetToToday,
    syncNow,
    reloadProfileAndCache,
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