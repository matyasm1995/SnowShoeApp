import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import {
  calculateDutyStatus,
  downloadSchedule,
  getCachedSchedule,
  getGuideProfile,
  isGuideProfileConfigured,
  parseGuideAssignments,
} from './googleSheetsService';
import { scheduleTomorrowDispatchNotification } from './notificationService';

export const BACKGROUND_SCHEDULE_SYNC_TASK = 'arctic-guide-background-schedule-sync';

const STORAGE_KEY_BG_SYNC_REG_VER = 'pref:bg_sync_reg_version';
const CURRENT_BG_SYNC_REG_VER = 'v2_15m';

const PEAK_DISPATCH_MIN_AGE_MS = 12 * 60 * 1000; // 12 min during 17:30–19:00 Oslo time
const AFTERNOON_MIN_AGE_MS = 25 * 60 * 1000; // 25 min during 15:00–17:29 Oslo time
const EVENING_MIN_AGE_MS = 45 * 60 * 1000; // 45 min during 19:01–20:59 Oslo time
const DAYTIME_MIN_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours during 07:00–14:59 Oslo time
const BACKGROUND_FETCH_INTERVAL_SEC = 15 * 60; // 15 min minimum interval (Android shortest)

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

if (!TaskManager.isTaskDefined(BACKGROUND_SCHEDULE_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SCHEDULE_SYNC_TASK, async () => {
    try {
      const configured = await isGuideProfileConfigured();
      if (!configured) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const now = new Date();
      const osloMin = getOsloMinutesOfDay(now);

      // Skip overnight (21:00–06:59 Oslo time) to save battery & Apps Script quota
      if (osloMin < 7 * 60 || osloMin >= 21 * 60) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const cached = await getCachedSchedule();
      const lastSyncMs = cached?.syncedAt ? Date.parse(cached.syncedAt) : 0;
      const ageMs = Number.isFinite(lastSyncMs) ? Date.now() - lastSyncMs : Infinity;

      let minAgeMs = DAYTIME_MIN_AGE_MS;
      if (osloMin >= 17 * 60 + 30 && osloMin <= 19 * 60) {
        minAgeMs = PEAK_DISPATCH_MIN_AGE_MS;
      } else if (osloMin >= 15 * 60 && osloMin < 17 * 60 + 30) {
        minAgeMs = AFTERNOON_MIN_AGE_MS;
      } else if (osloMin > 19 * 60) {
        minAgeMs = EVENING_MIN_AGE_MS;
      }

      if (ageMs < minAgeMs) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const [profile, fresh] = await Promise.all([getGuideProfile(), downloadSchedule()]);

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { assignments: tmrAssignments, targetRowIdx: tmrRow } = parseGuideAssignments(
        fresh.values,
        fresh.notes,
        fresh.comments,
        fresh.backgrounds,
        fresh.fontLines,
        profile.initials,
        tomorrow
      );

      const tmrDuty = calculateDutyStatus(
        fresh.values,
        tmrRow,
        profile,
        tmrAssignments.length
      );

      await scheduleTomorrowDispatchNotification({
        tomorrowDate: tomorrow,
        tomorrowAssignments: tmrAssignments,
        tomorrowDuty: tmrDuty,
        syncedAtIso: fresh.syncedAt,
        notifyIfChangedAfterDispatch: true,
      });

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerBackgroundScheduleSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) {
      return;
    }

    const [alreadyRegistered, regVer] = await Promise.all([
      TaskManager.isTaskRegisteredAsync(BACKGROUND_SCHEDULE_SYNC_TASK),
      AsyncStorage.getItem(STORAGE_KEY_BG_SYNC_REG_VER),
    ]);

    if (alreadyRegistered && regVer === CURRENT_BG_SYNC_REG_VER) {
      return;
    }

    if (alreadyRegistered) {
      try {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SCHEDULE_SYNC_TASK);
      } catch {}
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SCHEDULE_SYNC_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    await AsyncStorage.setItem(STORAGE_KEY_BG_SYNC_REG_VER, CURRENT_BG_SYNC_REG_VER);
  } catch {
    // Ignore in unsupported environments (e.g. Expo Go without background fetch)
  }
}
