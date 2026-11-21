import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatClock, osloDateKey } from '../utils/format';
import type {
  DutyStatus,
  GuideAssignment,
} from './googleSheetsService';
import type { SubmittedTripReportRecord } from './tripReportService';

const ASKED_NOTIF_KEY = 'pref:asked_notifications_v1';
const LAST_TOMORROW_DISPATCH_KEY = 'pref:last_tomorrow_dispatch_v1';
const TOMORROW_DISPATCH_NOTIF_ID = 'arctic-guide-tomorrow-dispatch';

interface LastTomorrowDispatchRecord {
  targetDateKey: string;
  fingerprint: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureNotificationPermission(): Promise<boolean> {
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

export async function syncTripReportNotifications(
  assignments: GuideAssignment[],
  submittedReports: Record<string, SubmittedTripReportRecord>,
  targetDate: Date
): Promise<void> {
  try {
    const todayKey = osloDateKey(new Date());
    if (osloDateKey(targetDate) !== todayKey) return;
    if (assignments.length === 0) return;

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existingByTourKey = new Map<string, string>();
    for (const item of scheduled) {
      const k = item.content.data?.tourKey;
      if (typeof k === 'string') {
        existingByTourKey.set(k, item.identifier);
      }
    }

    for (let idx = 0; idx < assignments.length; idx++) {
      const tour = assignments[idx];
      if (!tour) continue;

      const tourKey = `${todayKey}_${tour.tourName.replace(/\s+/g, '_')}_${idx}`;
      const existingId = existingByTourKey.get(tourKey);
      const isSubmitted = Boolean(submittedReports[tourKey]);

      if (isSubmitted) {
        if (existingId) {
          await Notifications.cancelScheduledNotificationAsync(existingId);
        }
        continue;
      }

      if (tour.endMinutes === null || existingId) continue;

      const remindMinutes = tour.endMinutes + 15;
      const triggerDate = new Date();
      triggerDate.setHours(
        Math.floor(remindMinutes / 60),
        remindMinutes % 60,
        0,
        0
      );

      if (triggerDate.getTime() <= Date.now() + 60000) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Post-Trip Report Reminder',
          body: `${tour.tourName} finished — don’t forget to submit your trip report.`,
          data: { tourKey },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    }
  } catch {
    // Ignore in unsupported environments
  }
}

export async function cancelTripReportNotification(tourKey: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.content.data?.tourKey === tourKey) {
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
          `${t.tourName}|${t.startTimeLabel ?? ''}|${t.endTimeLabel ?? ''}|${t.guestCount}|${t.vehicle ?? ''}|${t.meetingPoint ?? ''}`
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
        const pax = t.guestCount > 0 ? ` (${t.guestCount} pax)` : '';
        return `${time}${t.tourName}${pax}`;
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

    // If 18:30 has already passed today: only send an immediate follow-up if called from
    // background sync and tomorrow's schedule changed compared to what was previously scheduled
    if (target1830.getTime() <= now.getTime() + 60000) {
      const changedSinceLastDispatch =
        params.notifyIfChangedAfterDispatch === true &&
        lastRecord !== null &&
        lastRecord.targetDateKey === targetDateKey &&
        lastRecord.fingerprint !== fingerprint &&
        now.getHours() < 21;

      if (changedSinceLastDispatch) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Tomorrow's Schedule Updated (${dayName})`,
            body,
            data: { targetDateIso: targetDateKey },
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
        data: { targetDateIso: targetDateKey },
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