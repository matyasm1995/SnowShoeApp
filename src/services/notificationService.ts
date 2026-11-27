import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { CONFIG } from '../config';
import { formatClock, osloDateKey } from '../utils/format';
import type {
  DutyStatus,
  GuideAssignment,
  GuideProfile,
} from './googleSheetsService';
import type { SubmittedTripReportRecord } from './tripReportService';

const ASKED_NOTIF_KEY = 'pref:asked_notifications_v1';
const LAST_TOMORROW_DISPATCH_KEY = 'pref:last_tomorrow_dispatch_v1';
const PUSH_REGISTRATION_KEY = 'pref:push_registration_v1';
const TOMORROW_DISPATCH_NOTIF_ID = 'arctic-guide-tomorrow-dispatch';
const PUSH_REREGISTER_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface LastTomorrowDispatchRecord {
  targetDateKey: string;
  fingerprint: string;
}

interface PushRegistrationRecord {
  token: string;
  initials: string;
  fullName: string;
  contractType: string;
  registeredAtIso: string;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Guide Operations',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      return true;
    }

    const alreadyAsked = await AsyncStorage.getItem(ASKED_NOTIF_KEY);
    if (alreadyAsked === 'true') {
      return false;
    }

    await AsyncStorage.setItem(ASKED_NOTIF_KEY, 'true');
    const req = await Notifications.requestPermissionsAsync();
    if (req.status === 'granted') {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Guide Operations',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function isServerPushRegistered(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PushRegistrationRecord>;
    return Boolean(parsed.token && parsed.initials);
  } catch {
    return false;
  }
}

export async function registerDeviceForPushDispatch(
  profile: GuideProfile,
  force = false
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const cleanInitials = profile.initials.trim();
    const cleanName = profile.fullName.trim();
    if (!cleanInitials || !cleanName) return false;

    const granted = await ensureNotificationPermission();
    if (!granted) return false;

    const tokenResp = await Notifications.getExpoPushTokenAsync({
      projectId: CONFIG.app.expoProjectId,
    });
    const token = tokenResp?.data?.trim();
    if (!token) return false;

    if (!force) {
      try {
        const rawPrev = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY);
        if (rawPrev) {
          const prev = JSON.parse(rawPrev) as PushRegistrationRecord;
          const ageMs = Date.now() - Date.parse(prev.registeredAtIso || '');
          if (
            prev.token === token &&
            prev.initials === cleanInitials &&
            prev.fullName === cleanName &&
            prev.contractType === profile.contractType &&
            Number.isFinite(ageMs) &&
            ageMs < PUSH_REREGISTER_INTERVAL_MS
          ) {
            return true;
          }
        }
      } catch {}
    }

    const res = await fetch(CONFIG.sheet.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'register_push',
        token,
        initials: cleanInitials,
        fullName: cleanName,
        contractType: profile.contractType,
      }),
    });

    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { status?: string } | null;
    if (json?.status !== 'success') return false;

    const record: PushRegistrationRecord = {
      token,
      initials: cleanInitials,
      fullName: cleanName,
      contractType: profile.contractType,
      registeredAtIso: new Date().toISOString(),
    };
    await AsyncStorage.setItem(PUSH_REGISTRATION_KEY, JSON.stringify(record));

    // Server push is now active — cancel any local 18:30 fallback alarm to avoid duplicates
    try {
      await Notifications.cancelScheduledNotificationAsync(TOMORROW_DISPATCH_NOTIF_ID);
    } catch {}

    return true;
  } catch {
    // Expected before FCM / google-services.json is built into the native binary
    return false;
  }
}

const TRIP_REPORT_ID_PREFIX = 'trip-report:';
let tripReportSyncChain: Promise<void> = Promise.resolve();

function isTripReportNotification(item: Notifications.NotificationRequest): boolean {
  if (item.identifier.startsWith(TRIP_REPORT_ID_PREFIX)) return true;
  const data = item.content.data;
  if (!data || typeof data !== 'object') return false;
  return data.type === 'trip_report' || typeof data.tourKey === 'string';
}

function getScheduledTriggerMs(item: Notifications.NotificationRequest): number | null {
  const trigger = item.trigger as { value?: unknown; date?: unknown } | null;
  if (!trigger || typeof trigger !== 'object') return null;
  if (typeof trigger.value === 'number' && Number.isFinite(trigger.value)) {
    return trigger.value;
  }
  if (typeof trigger.date === 'number' && Number.isFinite(trigger.date)) {
    return trigger.date;
  }
  if (trigger.date instanceof Date && Number.isFinite(trigger.date.getTime())) {
    return trigger.date.getTime();
  }
  return null;
}

async function syncTripReportNotificationsInternal(
  assignments: GuideAssignment[],
  submittedReports: Record<string, SubmittedTripReportRecord>,
  targetDate: Date
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const todayKey = osloDateKey(new Date());
    if (osloDateKey(targetDate) !== todayKey) return;

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const desiredById = new Map<
      string,
      {
        identifier: string;
        tourKey: string;
        tourIdx: number;
        tourName: string;
        triggerDate: Date;
      }
    >();

    for (let idx = 0; idx < assignments.length; idx++) {
      const tour = assignments[idx];
      if (!tour) continue;

      const tourKey = `${todayKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
      const isSubmitted = Boolean(submittedReports[tourKey]);
      const isDriverOnly = tour.role === 'driver';
      if (isSubmitted || isDriverOnly || tour.endMinutes === null) continue;

      const remindMinutes = tour.endMinutes + 15;
      const triggerDate = new Date();
      triggerDate.setHours(
        Math.floor(remindMinutes / 60),
        remindMinutes % 60,
        0,
        0
      );

      if (triggerDate.getTime() <= Date.now() + 60000) continue;

      const identifier = `${TRIP_REPORT_ID_PREFIX}${tourKey}`;
      desiredById.set(identifier, {
        identifier,
        tourKey,
        tourIdx: idx,
        tourName: tour.tourName,
        triggerDate,
      });
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const alreadyUpToDateIds = new Set<string>();

    for (const item of scheduled) {
      if (!isTripReportNotification(item)) continue;

      const desired = desiredById.get(item.identifier);
      const scheduledMs = getScheduledTriggerMs(item);
      const matchesTime =
        desired !== undefined &&
        scheduledMs !== null &&
        Math.abs(scheduledMs - desired.triggerDate.getTime()) < 60000;

      if (desired && matchesTime && !alreadyUpToDateIds.has(item.identifier)) {
        alreadyUpToDateIds.add(item.identifier);
        continue;
      }

      // Cancel stale tours (e.g. swapped from Ski -> Fatbike), legacy random-UUID duplicates,
      // submitted/driver-only tours, or rescheduled times.
      try {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      } catch {}
    }

    for (const desired of desiredById.values()) {
      if (alreadyUpToDateIds.has(desired.identifier)) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: desired.identifier,
        content: {
          title: 'Post-Trip Report Reminder',
          body: `${desired.tourName} finished — tap to fill out your trip report.`,
          data: {
            type: 'trip_report',
            tourKey: desired.tourKey,
            tourIdx: desired.tourIdx,
            dateIso: todayKey,
            openReport: true,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: desired.triggerDate,
        },
      });
    }
  } catch {
    // Ignore in unsupported environments
  }
}

export function syncTripReportNotifications(
  assignments: GuideAssignment[],
  submittedReports: Record<string, SubmittedTripReportRecord>,
  targetDate: Date
): Promise<void> {
  const next = tripReportSyncChain
    .catch(() => {})
    .then(() => syncTripReportNotificationsInternal(assignments, submittedReports, targetDate));
  tripReportSyncChain = next;
  return next;
}

export async function cancelTripReportNotification(tourKey: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const canonicalId = `${TRIP_REPORT_ID_PREFIX}${tourKey}`;
    try {
      await Notifications.cancelScheduledNotificationAsync(canonicalId);
    } catch {}

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.identifier === canonicalId || item.content.data?.tourKey === tourKey) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch {}
}

function buildTomorrowDispatchFingerprint(params: {
  tomorrowAssignments: GuideAssignment[];
  tomorrowDuty: DutyStatus;
}): string {
  if (params.tomorrowAssignments.length > 0) {
    const toursSig = params.tomorrowAssignments
      .map(
        (t) =>
          `${t.tourName}|${t.role}|${t.startTimeLabel ?? ''}|${t.endTimeLabel ?? ''}|${t.guestCount}|${t.vehicle ?? ''}|${t.meetingPoint ?? ''}`
      )
      .join(';');
    return `tours:${toursSig}|rc:${params.tomorrowDuty.alsoRentalCenter ? '1' : '0'}`;
  }
  return `duty:${params.tomorrowDuty.type}|${params.tomorrowDuty.title}`;
}

export async function scheduleTomorrowDispatchNotification(params: {
  tomorrowDate: Date;
  tomorrowAssignments: GuideAssignment[];
  tomorrowDuty: DutyStatus;
  syncedAtIso?: string;
  notifyIfChangedAfterDispatch?: boolean;
}): Promise<void> {
  try {
    // If server-side 18:30 push from Code.gs is registered, skip local 18:30 scheduling
    // so guides only receive the single fresh server-pushed notification.
    if (await isServerPushRegistered()) {
      try {
        await Notifications.cancelScheduledNotificationAsync(TOMORROW_DISPATCH_NOTIF_ID);
      } catch {}
      return;
    }

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const targetDateKey = osloDateKey(params.tomorrowDate);
    const fingerprint = buildTomorrowDispatchFingerprint(params);

    const dayName = params.tomorrowDate.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

    let title = `Tomorrow's Schedule (${dayName})`;
    let body = '';

    if (params.tomorrowAssignments.length > 0) {
      const tourSummaries = params.tomorrowAssignments.map((t) => {
        const time = t.startTimeLabel ? `${t.startTimeLabel} ` : '';
        const roleTag = t.role === 'driver' ? ' [Driver]' : '';
        const pax = t.guestCount > 0 ? ` (${t.guestCount} pax)` : '';
        return `${time}${t.tourName}${roleTag}${pax}`;
      });
      if (params.tomorrowDuty.alsoRentalCenter) {
        tourSummaries.push('Rental Center');
      }
      body = tourSummaries.join(' · ');
    } else if (params.tomorrowDuty.type === 'day_off') {
      title = `Tomorrow: Day Off (${dayName})`;
      body = 'No tours or shift assigned tomorrow. Enjoy your day off!';
    } else {
      title = `Tomorrow: ${params.tomorrowDuty.title} (${dayName})`;
      body = params.tomorrowDuty.detail || 'On duty at Tromsø Outdoor tomorrow.';
    }

    if (params.syncedAtIso) {
      const syncedDate = new Date(params.syncedAtIso);
      if (!Number.isNaN(syncedDate.getTime())) {
        body = `${body} · synced ${formatClock(syncedDate)}`;
      }
    }

    // Always cancel the previous scheduled dispatch notification first
    try {
      await Notifications.cancelScheduledNotificationAsync(TOMORROW_DISPATCH_NOTIF_ID);
    } catch {}

    const now = new Date();
    const target1830 = new Date(now);
    target1830.setHours(18, 30, 0, 0);

    let lastRecord: LastTomorrowDispatchRecord | null = null;
    try {
      const raw = await AsyncStorage.getItem(LAST_TOMORROW_DISPATCH_KEY);
      if (raw) lastRecord = JSON.parse(raw) as LastTomorrowDispatchRecord;
    } catch {}

    // If 18:30 has already passed today (or is <5s away): only send an immediate follow-up
    // if called from background sync and tomorrow's schedule changed since last dispatch.
    if (target1830.getTime() <= now.getTime() + 5000) {
      const changedSinceLastDispatch =
        params.notifyIfChangedAfterDispatch === true &&
        lastRecord !== null &&
        lastRecord.targetDateKey === targetDateKey &&
        lastRecord.fingerprint !== fingerprint &&
        now.getHours() < 21;

      if (changedSinceLastDispatch) {
        try {
          await Notifications.dismissNotificationAsync(TOMORROW_DISPATCH_NOTIF_ID);
        } catch {}

        await Notifications.scheduleNotificationAsync({
          identifier: TOMORROW_DISPATCH_NOTIF_ID,
          content: {
            title: `Tomorrow's Schedule Updated (${dayName})`,
            body,
            data: { type: 'tomorrow_dispatch', targetDateIso: targetDateKey },
          },
          trigger: null,
        });
      }

      try {
        const nextRec: LastTomorrowDispatchRecord = { targetDateKey, fingerprint };
        await AsyncStorage.setItem(LAST_TOMORROW_DISPATCH_KEY, JSON.stringify(nextRec));
      } catch {}
      return;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: TOMORROW_DISPATCH_NOTIF_ID,
      content: {
        title,
        body,
        data: { type: 'tomorrow_dispatch', targetDateIso: targetDateKey },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target1830,
      },
    });

    try {
      const nextRec: LastTomorrowDispatchRecord = { targetDateKey, fingerprint };
      await AsyncStorage.setItem(LAST_TOMORROW_DISPATCH_KEY, JSON.stringify(nextRec));
    } catch {}
  } catch {
    // Ignore in unsupported environments
  }
}