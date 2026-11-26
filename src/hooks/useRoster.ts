import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadJson, saveJson } from '../services/persistence';

export interface Guest {
  id: string;
  name: string;
  partySize: number;
  bootSize: string;
  height: string;
  weight: string;
  medicalNotes: string;
  phone: string;
  bookingRef: string;
  checkedIn: boolean;
}

export type NewGuestInput = Omit<
  Guest,
  'id' | 'partySize' | 'phone' | 'bookingRef' | 'checkedIn'
> & {
  partySize?: number;
  phone?: string;
  bookingRef?: string;
  checkedIn?: boolean;
};

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isGuest(value: unknown): value is Partial<Guest> & { id: string; name: string } {
  if (!value || typeof value !== 'object') return false;
  const guest = value as Partial<Guest>;
  return typeof guest.id === 'string' && typeof guest.name === 'string';
}

function normalizePartySize(size: number | undefined): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return 1;
  return Math.max(1, Math.round(size));
}

export function useRoster(tourKey: string = 'default'): {
  guests: Guest[];
  totalGuestsCount: number;
  checkedInCount: number;
  ready: boolean;
  addGuest: (guest: NewGuestInput) => void;
  importGuests: (newGuests: NewGuestInput[]) => number;
  updateGuest: (id: string, patch: Partial<Omit<Guest, 'id'>>) => void;
  toggleCheckedIn: (id: string) => void;
  removeGuest: (id: string) => void;
  clearRoster: () => void;
} {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [ready, setReady] = useState(false);

  const storageKey = `roster:v4:${tourKey}`;

  useEffect(() => {
    let active = true;
    setReady(false);
    void loadJson<unknown>(storageKey).then((stored) => {
      if (!active) return;
      if (Array.isArray(stored)) {
        const validated = stored.filter(isGuest).map((g) => ({
          id: g.id,
          name: g.name,
          partySize: normalizePartySize(g.partySize),
          bootSize: g.bootSize || '',
          height: g.height || '',
          weight: g.weight || '',
          medicalNotes: g.medicalNotes || '',
          phone: g.phone || '',
          bookingRef: g.bookingRef || '',
          checkedIn: Boolean(g.checkedIn),
        }));
        setGuests(validated);
      } else {
        setGuests([]);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    void saveJson(storageKey, guests);
  }, [guests, ready, storageKey]);

  const totalGuestsCount = useMemo(
    () => guests.reduce((sum, g) => sum + normalizePartySize(g.partySize), 0),
    [guests]
  );

  const checkedInCount = useMemo(
    () =>
      guests.reduce(
        (sum, g) => sum + (g.checkedIn ? normalizePartySize(g.partySize) : 0),
        0
      ),
    [guests]
  );

  const addGuest = useCallback((guest: NewGuestInput) => {
    const name = guest.name.trim();
    if (!name) return;
    setGuests((current) => [
      {
        id: createId(),
        name,
        partySize: normalizePartySize(guest.partySize),
        bootSize: guest.bootSize.trim(),
        height: guest.height.trim(),
        weight: guest.weight.trim(),
        medicalNotes: guest.medicalNotes.trim(),
        phone: (guest.phone || '').trim(),
        bookingRef: (guest.bookingRef || '').trim(),
        checkedIn: Boolean(guest.checkedIn),
      },
      ...current,
    ]);
  }, []);

  const importGuests = useCallback((incoming: NewGuestInput[]): number => {
    let addedCount = 0;
    setGuests((current) => {
      const existingByName = new Map(
        current.map((g, idx) => [g.name.toLowerCase().trim(), idx])
      );
      const next = [...current];
      const toAdd: Guest[] = [];

      for (const item of incoming) {
        const cleanName = item.name.trim();
        if (!cleanName) continue;
        const key = cleanName.toLowerCase();
        const existingIdx = existingByName.get(key);

        if (existingIdx !== undefined) {
          const prev = next[existingIdx]!;
          next[existingIdx] = {
            ...prev,
            phone: prev.phone || (item.phone || '').trim(),
            bookingRef: prev.bookingRef || (item.bookingRef || '').trim(),
          };
          continue;
        }

        existingByName.set(key, -1);
        toAdd.push({
          id: createId(),
          name: cleanName,
          partySize: normalizePartySize(item.partySize),
          bootSize: item.bootSize.trim(),
          height: item.height.trim(),
          weight: item.weight.trim(),
          medicalNotes: item.medicalNotes.trim(),
          phone: (item.phone || '').trim(),
          bookingRef: (item.bookingRef || '').trim(),
          checkedIn: Boolean(item.checkedIn),
        });
        addedCount++;
      }
      return [...toAdd, ...next];
    });
    return addedCount;
  }, []);

  const updateGuest = useCallback((id: string, patch: Partial<Omit<Guest, 'id'>>) => {
    setGuests((current) =>
      current.map((guest) => {
        if (guest.id !== id) return guest;
        return {
          ...guest,
          ...patch,
          partySize:
            patch.partySize !== undefined
              ? normalizePartySize(patch.partySize)
              : guest.partySize,
        };
      })
    );
  }, []);

  const toggleCheckedIn = useCallback((id: string) => {
    setGuests((current) =>
      current.map((guest) =>
        guest.id === id ? { ...guest, checkedIn: !guest.checkedIn } : guest
      )
    );
  }, []);

  const removeGuest = useCallback((id: string) => {
    setGuests((current) => current.filter((guest) => guest.id !== id));
  }, []);

  const clearRoster = useCallback(() => {
    setGuests([]);
  }, []);

  return {
    guests,
    totalGuestsCount,
    checkedInCount,
    ready,
    addGuest,
    importGuests,
    updateGuest,
    toggleCheckedIn,
    removeGuest,
    clearRoster,
  };
}
