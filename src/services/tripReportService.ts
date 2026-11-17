import { loadJson, saveJson } from './persistence';

const FORM_BASE =
  'https://docs.google.com/forms/d/e/1FAIpQLSet1ZR3f0FfgFLuB1IqgSPxjWaq72tMdtfks9EEpz__FYFeFA';
const FORM_RESPONSE_URL = `${FORM_BASE}/formResponse`;
const FORM_VIEW_URL = `${FORM_BASE}/viewform`;

const SUBMITTED_KEY = 'reports:submitted:v1';
const QUEUE_KEY = 'reports:queue:v1';

export const FORM_TRIP_OPTIONS = [
  '5hr snowshoe hill hike at 9:30',
  'Coffee trip at 9:00',
  'Snowshoe trip in Tromsoya at 10:00',
  'HG snowshoe at 14:15',
  'XC ski trip at 9:00',
  'XC ski trip at 13:30',
  'HG ski at 14:15',
  'Bike trip 10:00',
  'Bike trip 14:30',
  'HG bike trip 14:15',
  'Fatbike trip',
  'Other',
] as const;

export type FormTripOption = (typeof FORM_TRIP_OPTIONS)[number];

export interface TripReportPayload {
  tourKey: string;
  dateIso: string; // YYYY-MM-DD
  guideName: string;
  tripOption: FormTripOption;
  otherTripText?: string;
  attendedPax: number;
  hillHikeLocation: string; // 'Tverrfjellet' | 'Rundfjellet' | ''
  notes: string;
}

export interface SubmittedTripReportRecord {
  tourKey: string;
  submittedAtIso: string;
  queuedOffline: boolean;
  attendedPax: number;
  tripOption: string;
  hillHikeLocation: string;
  notes: string;
}

export function matchFormTripOption(rawTourName: string, isHillHike: boolean): FormTripOption {
  if (isHillHike) {
    return '5hr snowshoe hill hike at 9:30';
  }

  const lower = rawTourName.toLowerCase();

  // Coffee trip
  if (lower.includes('coffe') || lower.includes('coffee') || lower.includes('cafe')) {
    return 'Coffee trip at 9:00';
  }

  // Ship tours (14:15 or Hurtigruten / Havila / M5 / HN5)
  const isShip =
    lower.includes('14:15') ||
    lower.includes('14.15') ||
    lower.includes('hg') ||
    lower.includes('m5') ||
    lower.includes('n5') ||
    lower.includes('hurtigruten') ||
    lower.includes('havila');

  // Snowshoe
  if (lower.includes('snowshoe') || lower.includes('w 103') || lower.includes('tromso')) {
    if (isShip) return 'HG snowshoe at 14:15';
    return 'Snowshoe trip in Tromsoya at 10:00';
  }

  // Ski
  if (lower.includes('ski')) {
    if (isShip) return 'HG ski at 14:15';
    if (lower.includes('13:30') || lower.includes('13.30') || lower.includes('14:30') || lower.includes('14.30')) {
      return 'XC ski trip at 13:30';
    }
    return 'XC ski trip at 9:00';
  }

  // Bike / Fatbike
  if (lower.includes('bike') || lower.includes('fatbik')) {
    if (isShip) return 'HG bike trip 14:15';
    if (lower.includes('14:30') || lower.includes('14.30')) {
      return 'Bike trip 14:30';
    }
    if (lower.includes('10:00') || lower.includes('10.00')) {
      return 'Bike trip 10:00';
    }
    return 'Fatbike trip';
  }

  return 'Other';
}

function buildFormBody(payload: TripReportPayload): URLSearchParams {
  const params = new URLSearchParams();
  params.append('entry.697979218', payload.dateIso);
  params.append('entry.1132009206', payload.guideName);

  if (payload.tripOption === 'Other') {
    params.append('entry.2012610289', '__other_option__');
    params.append(
      'entry.2012610289.other_option_response',
      payload.otherTripText && payload.otherTripText.trim().length > 0
        ? payload.otherTripText.trim()
        : 'Other'
    );
  } else {
    params.append('entry.2012610289', payload.tripOption);
  }

  params.append('entry.807838289', String(Math.max(0, payload.attendedPax)));

  if (payload.hillHikeLocation.trim().length > 0) {
    params.append('entry.1039943902', payload.hillHikeLocation.trim());
  }

  params.append('entry.2061766555', payload.notes.trim());
  return params;
}

export function buildPrefilledReportUrl(payload: TripReportPayload): string {
  const params = buildFormBody(payload);
  return `${FORM_VIEW_URL}?usp=pp_url&${params.toString()}`;
}

async function postToGoogleForm(payload: TripReportPayload): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const body = buildFormBody(payload).toString();
    const res = await fetch(FORM_RESPONSE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });

    // 400 Bad Request indicates form rejected invalid choice/data.
    // 200, 302 or status 0 (opaque redirect) are accepted submissions.
    if (res.status >= 400) {
      throw new Error(`Google Form validation error (HTTP ${res.status})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSubmittedReports(): Promise<Record<string, SubmittedTripReportRecord>> {
  const stored = await loadJson<Record<string, SubmittedTripReportRecord>>(SUBMITTED_KEY);
  return stored && typeof stored === 'object' ? stored : {};
}

export async function loadQueuedReports(): Promise<TripReportPayload[]> {
  const stored = await loadJson<TripReportPayload[]>(QUEUE_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function submitOrQueueTripReport(
  payload: TripReportPayload
): Promise<{ sentLive: boolean; record: SubmittedTripReportRecord }> {
  let sentLive = false;
  try {
    await postToGoogleForm(payload);
    sentLive = true;
  } catch {
    sentLive = false;
  }

  const queue = await loadQueuedReports();
  const filtered = queue.filter((q) => q.tourKey !== payload.tourKey);
  if (!sentLive) {
    filtered.push(payload);
  }
  await saveJson(QUEUE_KEY, filtered);

  const submitted = await loadSubmittedReports();
  const record: SubmittedTripReportRecord = {
    tourKey: payload.tourKey,
    submittedAtIso: new Date().toISOString(),
    queuedOffline: !sentLive,
    attendedPax: payload.attendedPax,
    tripOption:
      payload.tripOption === 'Other' && payload.otherTripText
        ? payload.otherTripText
        : payload.tripOption,
    hillHikeLocation: payload.hillHikeLocation,
    notes: payload.notes,
  };
  submitted[payload.tourKey] = record;
  await saveJson(SUBMITTED_KEY, submitted);

  return { sentLive, record };
}

export async function flushQueuedTripReports(): Promise<number> {
  const queue = await loadQueuedReports();
  if (queue.length === 0) return 0;

  const remaining: TripReportPayload[] = [];
  let sentCount = 0;
  const submitted = await loadSubmittedReports();

  for (const item of queue) {
    try {
      await postToGoogleForm(item);
      sentCount++;
      const existing = submitted[item.tourKey];
      if (existing) {
        submitted[item.tourKey] = { ...existing, queuedOffline: false };
      }
    } catch {
      remaining.push(item);
    }
  }

  await saveJson(QUEUE_KEY, remaining);
  if (sentCount > 0) {
    await saveJson(SUBMITTED_KEY, submitted);
  }
  return sentCount;
}