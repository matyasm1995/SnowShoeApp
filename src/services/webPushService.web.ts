import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

import { CONFIG } from '../config';
import type { GuideProfile } from './googleSheetsService';

export type WebPushStatus =
  | 'unsupported'
  | 'needs_home_screen'
  | 'denied'
  | 'prompt'
  | 'active';

const WEB_PUSH_REG_KEY = 'pref:web_push_registration_v1';
const REREGISTER_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface WebPushRegistrationRecord {
  fcmToken: string;
  initials: string;
  fullName: string;
  contractType: string;
  registeredAtIso: string;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function getFirebaseApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;
  return initializeApp({
    apiKey: CONFIG.firebaseWeb.apiKey,
    authDomain: CONFIG.firebaseWeb.authDomain,
    projectId: CONFIG.firebaseWeb.projectId,
    storageBucket: CONFIG.firebaseWeb.storageBucket,
    messagingSenderId: CONFIG.firebaseWeb.messagingSenderId,
    appId: CONFIG.firebaseWeb.appId,
  });
}

async function getActiveServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      await navigator.serviceWorker.ready;
      return existing;
    }
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (typeof window === 'undefined') return 'unsupported';

  // iPhone / iPad Safari requires installing to Home Screen first before Push API exists
  if (isIosDevice() && !isStandalonePwa()) {
    return 'needs_home_screen';
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return isIosDevice() ? 'needs_home_screen' : 'unsupported';
  }

  const perm = Notification.permission;
  if (perm === 'denied') return 'denied';
  if (perm !== 'granted') return 'prompt';

  try {
    const raw = await AsyncStorage.getItem(WEB_PUSH_REG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WebPushRegistrationRecord>;
      if (parsed.fcmToken && parsed.initials) {
        return 'active';
      }
    }
  } catch {}

  return 'prompt';
}

async function registerTokenWithAppsScript(
  profile: GuideProfile,
  force = false
): Promise<{ ok: boolean; message: string }> {
  const cleanInitials = profile.initials.trim();
  const cleanName = profile.fullName.trim();
  if (!cleanInitials || !cleanName) {
    return {
      ok: false,
      message: 'Save your initials and name in Settings first.',
    };
  }

  const swReg = await getActiveServiceWorker();
  if (!swReg) {
    return {
      ok: false,
      message: 'Service worker is not active yet. Reload the page and try again.',
    };
  }

  const app = getFirebaseApp();
  const messaging = getMessaging(app);
  const fcmToken = await getToken(messaging, {
    vapidKey: CONFIG.firebaseWeb.vapidKey,
    serviceWorkerRegistration: swReg,
  });

  if (!fcmToken) {
    return {
      ok: false,
      message: 'Could not generate a Web Push token on this browser.',
    };
  }

  if (!force) {
    try {
      const rawPrev = await AsyncStorage.getItem(WEB_PUSH_REG_KEY);
      if (rawPrev) {
        const prev = JSON.parse(rawPrev) as WebPushRegistrationRecord;
        const ageMs = Date.now() - Date.parse(prev.registeredAtIso || '');
        if (
          prev.fcmToken === fcmToken &&
          prev.initials === cleanInitials &&
          prev.fullName === cleanName &&
          prev.contractType === profile.contractType &&
          Number.isFinite(ageMs) &&
          ageMs < REREGISTER_INTERVAL_MS
        ) {
          return { ok: true, message: '18:30 Web Push is active.' };
        }
      }
    } catch {}
  }

  const res = await fetch(CONFIG.sheet.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'register_web_push',
      fcmToken,
      initials: cleanInitials,
      fullName: cleanName,
      contractType: profile.contractType,
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      message: `Could not reach dispatch server (HTTP ${res.status}).`,
    };
  }

  const json = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
  if (json?.status !== 'success') {
    return {
      ok: false,
      message: json?.message || 'Dispatch server rejected push registration.',
    };
  }

  const record: WebPushRegistrationRecord = {
    fcmToken,
    initials: cleanInitials,
    fullName: cleanName,
    contractType: profile.contractType,
    registeredAtIso: new Date().toISOString(),
  };
  await AsyncStorage.setItem(WEB_PUSH_REG_KEY, JSON.stringify(record));

  return {
    ok: true,
    message: '18:30 push notifications enabled for this device!',
  };
}

/**
 * Must be called directly from a user tap/click handler on iOS Safari PWA.
 */
export async function enableWebPushNotifications(
  profile: GuideProfile
): Promise<{ ok: boolean; status: WebPushStatus; message: string }> {
  try {
    if (isIosDevice() && !isStandalonePwa()) {
      return {
        ok: false,
        status: 'needs_home_screen',
        message: 'On iPhone, tap Share → Add to Home Screen first, then open from the Home Screen icon.',
      };
    }

    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return {
        ok: false,
        status: 'unsupported',
        message: 'This browser does not support Web Push notifications.',
      };
    }

    // Call Notification.requestPermission() BEFORE any await so iOS Safari PWA
    // recognizes it as directly triggered by the user's tap gesture.
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission === 'denied') {
      return {
        ok: false,
        status: 'denied',
        message: 'Notifications are blocked. Enable them in your phone/browser settings for TO Guides.',
      };
    }
    if (permission !== 'granted') {
      return {
        ok: false,
        status: 'prompt',
        message: 'Notification permission was dismissed.',
      };
    }

    const supported = await isSupported().catch(() => false);
    if (!supported) {
      return {
        ok: false,
        status: 'unsupported',
        message: 'Web Push is not supported in this browser (requires iOS 16.4+ Home Screen app or desktop Chrome/Safari).',
      };
    }

    const result = await registerTokenWithAppsScript(profile, true);
    return {
      ok: result.ok,
      status: result.ok ? 'active' : 'prompt',
      message: result.message,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'prompt',
      message: err instanceof Error ? err.message : 'Failed to enable Web Push notifications.',
    };
  }
}

export async function syncWebPushIfGranted(
  profile: GuideProfile,
  force = false
): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;
    const supported = await isSupported().catch(() => false);
    if (!supported) return false;
    const result = await registerTokenWithAppsScript(profile, force);
    return result.ok;
  } catch {
    return false;
  }
}
