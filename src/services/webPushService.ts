import type { GuideProfile } from './googleSheetsService';

export type WebPushStatus =
  | 'unsupported'
  | 'needs_home_screen'
  | 'denied'
  | 'prompt'
  | 'active';

export async function getWebPushStatus(): Promise<WebPushStatus> {
  return 'unsupported';
}

export async function enableWebPushNotifications(
  _profile: GuideProfile
): Promise<{ ok: boolean; status: WebPushStatus; message: string }> {
  return {
    ok: false,
    status: 'unsupported',
    message: 'Web Push is only used in the browser/PWA.',
  };
}

export async function syncWebPushIfGranted(
  _profile: GuideProfile,
  _force = false
): Promise<boolean> {
  return false;
}
