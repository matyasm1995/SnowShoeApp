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

const PRE_DISPATCH_MIN_AGE_MS = 25 * 60 * 1000; // 25 min during 15:00–20:59 Oslo time
const DAYTIME_MIN_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours during 07:00–14:59 Oslo time
const BACKGROUND_FETCH_INTERVAL_SEC = 30 * 60; // 30 min minimum interval

function getOsloHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
}

if (!TaskManager.isTaskDefined(BACKGROUND_SCHEDULE_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SCHEDULE_SYNC_TASK, async () => {
    try {
      const configured = await isGuideProfileConfigured();
      if (!configured) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const now = new Date();
      const osloHour = getOsloHour(now);

      // Skip overnight (21:00–06:59 Oslo time) to save battery & Apps Script quota
      if (osloHour < 7 || osloHour >= 21) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      const cached = await getCachedSchedule();
      const lastSyncMs = cached?.syncedAt ? Date.parse(cached.syncedAt) : 0;
      const ageMs = Number.isFinite(lastSyncMs) ? Date.now() - lastSyncMs : Infinity;

      const minAgeMs = osloHour >= 15 ? PRE_DISPATCH_MIN_AGE_MS : DAYTIME_MIN_AGE_MS;
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

    const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SCHEDULE_SYNC_TASK
    );
    if (alreadyRegistered) {
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SCHEDULE_SYNC_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_SEC,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Ignore in unsupported environments (e.g. Expo Go without background fetch)
  }
}
