import { useCallback, useEffect, useState } from 'react';

import { loadJson, saveJson } from '../services/persistence';

export interface Guest {
  id: string;
  name: string;
  bootSize: string;
  height: string;
  weight: string;
  medicalNotes: string;
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isGuest(value: unknown): value is Guest {
  if (!value || typeof value !== 'object') return false;
  const guest = value as Partial<Guest>;
  return (
    typeof guest.id === 'string' &&
    typeof guest.name === 'string' &&
    typeof guest.bootSize === 'string'
  );
}

export function useRoster(tourKey: string = 'default'): {
  guests: Guest[];
  ready: boolean;
  addGuest: (guest: Omit<Guest, 'id'>) => void;
  importGuests: (newGuests: Omit<Guest, 'id'>[]) => number;
  updateGuest: (id: string, patch: Partial<Omit<Guest, 'id'>>) => void;
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
          ...g,
          height: g.height || '',
          weight: g.weight || '',
          medicalNotes: g.medicalNotes || '',
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

  const addGuest = useCallback((guest: Omit<Guest, 'id'>) => {
    const name = guest.name.trim();
    if (!name) return;
    setGuests((current) => [
      {
        id: createId(),
        name,
        bootSize: guest.bootSize.trim(),
        height: guest.height.trim(),
        weight: guest.weight.trim(),
        medicalNotes: guest.medicalNotes.trim(),
      },
      ...current,
    ]);
  }, []);

  const importGuests = useCallback((incoming: Omit<Guest, 'id'>[]): number => {
    let addedCount = 0;
    setGuests((current) => {
      const existingNames = new Set(current.map((g) => g.name.toLowerCase().trim()));
      const toAdd: Guest[] = [];

      for (const item of incoming) {
        const cleanName = item.name.trim();
        if (cleanName && !existingNames.has(cleanName.toLowerCase())) {
          existingNames.add(cleanName.toLowerCase());
          toAdd.push({
            id: createId(),
            name: cleanName,
            bootSize: item.bootSize.trim(),
            height: item.height.trim(),
            weight: item.weight.trim(),
            medicalNotes: item.medicalNotes.trim(),
          });
          addedCount++;
        }
      }
      return [...toAdd, ...current];
    });
    return addedCount;
  }, []);

  const updateGuest = useCallback((id: string, patch: Partial<Omit<Guest, 'id'>>) => {
    setGuests((current) =>
      current.map((guest) => (guest.id === id ? { ...guest, ...patch } : guest))
    );
  }, []);

  const removeGuest = useCallback((id: string) => {
    setGuests((current) => current.filter((guest) => guest.id !== id));
  }, []);

  const clearRoster = useCallback(() => {
    setGuests([]);
  }, []);

  return { guests, ready, addGuest, importGuests, updateGuest, removeGuest, clearRoster };
}