import { CONFIG } from '../config';
import type { GuideProfile } from '../services/googleSheetsService';

export interface CalendarExportLinks {
  httpsUrl: string;
  webcalUrl: string;
  downloadUrl: string;
  googleCalendarAddUrl: string;
}

export function buildCalendarExportLinks(
  profile: GuideProfile,
  includeDaysOff: boolean
): CalendarExportLinks | null {
  const initials = profile.initials.trim();
  if (!initials) return null;

  const params = new URLSearchParams();
  params.set('i', initials);
  const fullName = profile.fullName.trim();
  if (fullName) {
    params.set('n', fullName);
  }
  params.set('c', profile.contractType === 'part-time' ? 'pt' : 'ft');
  params.set('off', includeDaysOff ? '1' : '0');

  const base = CONFIG.links.webAppUrl.replace(/\/+$/, '');
  const query = params.toString();
  const httpsUrl = `${base}/api/calendar.ics?${query}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//i, 'webcal://');
  const downloadUrl = `${httpsUrl}&dl=1`;
  // Google Calendar's ?cid=webcal:// deep-link is ignored by the Android app and
  // frequently fails on web; opening the Add-by-URL settings page directly is reliable.
  const googleCalendarAddUrl =
    'https://calendar.google.com/calendar/u/0/r/settings/addbyurl';

  return {
    httpsUrl,
    webcalUrl,
    downloadUrl,
    googleCalendarAddUrl,
  };
}
