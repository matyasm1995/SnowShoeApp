const OSLO: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Oslo' };

export function formatTemperature(celsius: number): string {
  const rounded = Math.round(celsius * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(1)}°`;
}

export function formatMetersPerSecond(value: number): string {
  return value.toFixed(1);
}

export function formatClock(date: Date | null): string {
  if (!date) {
    return '—';
  }
  return date.toLocaleTimeString('en-GB', {
    ...OSLO,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'unknown time';
  }
  return date.toLocaleString('en-GB', {
    ...OSLO,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCountdown(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  const safe = Math.max(0, ms);
  const totalMinutes = Math.round(safe / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export function osloDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    ...OSLO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function humanizeSymbol(symbolCode: string | null): string | null {
  if (!symbolCode) {
    return null;
  }
  const cleaned = symbolCode.replace(/_/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
