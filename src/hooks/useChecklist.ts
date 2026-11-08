import { useCallback, useEffect, useState } from 'react';

import type { ChecklistId } from '../data/checklists';
import { loadJson, saveJson } from '../services/persistence';
import { osloDateKey } from '../utils/format';

function storageKey(checklistId: ChecklistId, date = new Date()): string {
  return `checklist:${checklistId}:${osloDateKey(date)}`;
}

export function useChecklist(checklistId: ChecklistId): {
  checked: Record<string, boolean>;
  ready: boolean;
  toggle: (itemId: string) => void;
} {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    void loadJson<Record<string, boolean>>(storageKey(checklistId)).then((stored) => {
      if (!active) {
        return;
      }
      setChecked(stored ?? {});
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [checklistId]);

  const toggle = useCallback(
    (itemId: string) => {
      if (!hydrated) {
        return;
      }
      setChecked((current) => {
        const next = {
          ...current,
          [itemId]: !current[itemId],
        };
        void saveJson(storageKey(checklistId), next);
        return next;
      });
    },
    [checklistId, hydrated],
  );

  return { checked, ready: hydrated, toggle };
}
