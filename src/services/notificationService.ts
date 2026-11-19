import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { osloDateKey } from '../utils/format';
import type {
  DutyStatus,
  GuideAssignment,
} from './googleSheetsService';
import type { SubmittedTripReportRecord } from './tripReportService';

const ASKED_NOTIF_KEY = 'pref:asked_notifications_v1';
const TOMORROW_DISPATCH_NOTIF_ID = 'arctic-guide-tomorrow-dispatch';

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

export async function scheduleTomorrowDispatchNotification(params: {
  tomorrowDate: Date;
  tomorrowAssignments: GuideAssignment[];
  tomorrowDuty: DutyStatus;
}): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;

    // Always cancel the previous scheduled dispatch notification first
    try {
      await Notifications.cancelScheduledNotificationAsync(TOMORROW_DISPATCH_NOTIF_ID);
    } catch {}

    const now = new Date();
    const target1830 = new Date(now);
    target1830.setHours(18, 30, 0, 0);

    // If 18:30 has already passed today, don't schedule for the past
    if (target1830.getTime() <= now.getTime() + 60000) {
      return;
    }

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
      body = tourSummaries.join(' · ');
    } else if (params.tomorrowDuty.type === 'day_off') {
      title = `Tomorrow: Day Off (${dayName})`;
      body = 'No tours or shift assigned tomorrow. Enjoy your day off!';
    } else {
      title = `Tomorrow: ${params.tomorrowDuty.title} (${dayName})`;
      body = params.tomorrowDuty.detail || 'On duty at Tromsø Outdoor tomorrow.';
    }

    await Notifications.scheduleNotificationAsync({
      identifier: TOMORROW_DISPATCH_NOTIF_ID,
      content: {
        title,
        body,
        data: { targetDateIso: osloDateKey(params.tomorrowDate) },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target1830,
      },
    });
  } catch {
    // Ignore in unsupported environments
  }
}