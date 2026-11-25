import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

type Listener = (ready: boolean) => void;

const CHECK_THROTTLE_MS = 15 * 60 * 1000;

let updateReady = false;
let checking = false;
let lastCheckMs = 0;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(updateReady);
    } catch {}
  });
}

export function isUpdateReady(): boolean {
  return updateReady;
}

export function subscribeUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateReady);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstalledUpdateInfo(): {
  isEnabled: boolean;
  channel: string | null;
  shortId: string | null;
  createdAtLabel: string | null;
} {
  if (Platform.OS === 'web') {
    return { isEnabled: false, channel: null, shortId: null, createdAtLabel: null };
  }
  const isEnabled = !__DEV__ && Updates.isEnabled;
  const channel = Updates.channel ?? null;
  const shortId = Updates.updateId ? Updates.updateId.slice(0, 8) : null;
  let createdAtLabel: string | null = null;
  if (Updates.createdAt instanceof Date && !Number.isNaN(Updates.createdAt.getTime())) {
    createdAtLabel = Updates.createdAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return { isEnabled, channel, shortId, createdAtLabel };
}

export async function checkAndDownloadUpdateSilently(force = false): Promise<boolean> {
  if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return false;
  if (updateReady) return true;
  if (checking) return false;
  if (!force && Date.now() - lastCheckMs < CHECK_THROTTLE_MS) return false;

  checking = true;
  lastCheckMs = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;

    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) {
      updateReady = true;
      notifyListeners();
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    checking = false;
  }
}

export async function checkForUpdateManually(): Promise<
  'updated' | 'up_to_date' | 'unavailable' | 'error'
> {
  if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return 'unavailable';
  if (updateReady) return 'updated';

  checking = true;
  lastCheckMs = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return 'up_to_date';

    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) {
      updateReady = true;
      notifyListeners();
      return 'updated';
    }
    return 'up_to_date';
  } catch {
    return 'error';
  } finally {
    checking = false;
  }
}

export async function applyPendingUpdate(): Promise<void> {
  if (Platform.OS === 'web' || __DEV__ || !Updates.isEnabled) return;
  try {
    await Updates.reloadAsync();
  } catch {}
}
