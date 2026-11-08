import { useCallback, useEffect, useState } from 'react';

import { loadJson, saveJson } from '../services/persistence';

export interface Guest {
  id: string;
  name: string;
  bootSize: string;
  medicalNotes: string;
}

const STORAGE_KEY = 'roster:guests:v1';

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isGuest(value: unknown): value is Guest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const guest = value as Partial<Guest>;
  return (
    typeof guest.id === 'string' &&
    typeof guest.name === 'string' &&
    typeof guest.bootSize === 'string' &&
    typeof guest.medicalNotes === 'string'
  );
}

export function useRoster(): {
  guests: Guest[];
  ready: boolean;
  addGuest: (guest: Omit<Guest, 'id'>) => void;
  updateGuest: (id: string, patch: Partial<Omit<Guest, 'id'>>) => void;
  removeGuest: (id: string) => void;
} {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadJson<unknown>(STORAGE_KEY).then((stored) => {
      if (!active) {
        return;
      }
      setGuests(Array.isArray(stored) ? stored.filter(isGuest) : []);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void saveJson(STORAGE_KEY, guests);
  }, [guests, ready]);

  const addGuest = useCallback((guest: Omit<Guest, 'id'>) => {
    const name = guest.name.trim();
    if (!name) {
      return;
    }
    setGuests((current) => [
      {
        id: createId(),
        name,
        bootSize: guest.bootSize.trim(),
        medicalNotes: guest.medicalNotes.trim(),
      },
      ...current,
    ]);
  }, []);

  const updateGuest = useCallback((id: string, patch: Partial<Omit<Guest, 'id'>>) => {
    setGuests((current) =>
      current.map((guest) => (guest.id === id ? { ...guest, ...patch } : guest)),
    );
  }, []);

  const removeGuest = useCallback((id: string) => {
    setGuests((current) => current.filter((guest) => guest.id !== id));
  }, []);

  return { guests, ready, addGuest, updateGuest, removeGuest };
}
