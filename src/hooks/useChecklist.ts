import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  CHECKLISTS,
  type ChecklistId,
  type ChecklistItem,
} from '../data/checklists';
import { loadJson, saveJson } from '../services/persistence';
import { osloDateKey } from '../utils/format';

export interface CustomChecklistTemplate {
  id: string;
  title: string;
  items: ChecklistItem[];
}

const TEMPLATES_STORAGE_KEY = 'checklist:templates:v2';
const ASSIGNMENTS_STORAGE_KEY = 'checklist:assign:v1';

function checkedStorageKey(templateId: string, date = new Date()): string {
  return `checklist:checked:${templateId}:${osloDateKey(date)}`;
}

function defaultTemplatesMap(): Record<string, CustomChecklistTemplate> {
  const map: Record<string, CustomChecklistTemplate> = {};
  for (const key of Object.keys(CHECKLISTS) as ChecklistId[]) {
    const tpl = CHECKLISTS[key];
    map[key] = {
      id: tpl.id,
      title: tpl.title,
      items: [...tpl.items],
    };
  }
  return map;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useChecklist(defaultChecklistId: ChecklistId, tourKey?: string): {
  activeTemplate: CustomChecklistTemplate;
  allTemplates: CustomChecklistTemplate[];
  checked: Record<string, boolean>;
  ready: boolean;
  toggle: (itemId: string) => void;
  selectTemplateForTour: (templateId: string) => void;
  createTemplate: (title: string) => void;
  addItem: (label: string) => void;
  removeItem: (itemId: string) => void;
} {
  const [templatesMap, setTemplatesMap] = useState<Record<string, CustomChecklistTemplate>>(
    defaultTemplatesMap
  );
  const [tourAssignments, setTourAssignments] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadJson<Record<string, CustomChecklistTemplate>>(TEMPLATES_STORAGE_KEY),
      loadJson<Record<string, string>>(ASSIGNMENTS_STORAGE_KEY),
    ]).then(([storedTemplates, storedAssigns]) => {
      if (!active) return;
      const base = defaultTemplatesMap();
      if (storedTemplates && typeof storedTemplates === 'object') {
        setTemplatesMap({ ...base, ...storedTemplates });
      } else {
        setTemplatesMap(base);
      }
      if (storedAssigns && typeof storedAssigns === 'object') {
        setTourAssignments(storedAssigns);
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const activeTemplateId = useMemo(() => {
    if (tourKey && tourAssignments[tourKey] && templatesMap[tourAssignments[tourKey]!]) {
      return tourAssignments[tourKey]!;
    }
    return defaultChecklistId;
  }, [tourKey, tourAssignments, templatesMap, defaultChecklistId]);

  const activeTemplate: CustomChecklistTemplate = useMemo(() => {
    return (
      templatesMap[activeTemplateId] ??
      templatesMap[defaultChecklistId] ?? {
        id: 'standard',
        title: CHECKLISTS.standard.title,
        items: [...CHECKLISTS.standard.items],
      }
    );
  }, [templatesMap, activeTemplateId, defaultChecklistId]);

  const allTemplates = useMemo(() => Object.values(templatesMap), [templatesMap]);

  useEffect(() => {
    let active = true;
    void loadJson<Record<string, boolean>>(checkedStorageKey(activeTemplate.id)).then((stored) => {
      if (!active) return;
      setChecked(stored ?? {});
    });
    return () => {
      active = false;
    };
  }, [activeTemplate.id]);

  const toggle = useCallback(
    (itemId: string) => {
      if (!hydrated) return;
      setChecked((current) => {
        const next = {
          ...current,
          [itemId]: !current[itemId],
        };
        void saveJson(checkedStorageKey(activeTemplate.id), next);
        return next;
      });
    },
    [activeTemplate.id, hydrated]
  );

  const selectTemplateForTour = useCallback(
    (templateId: string) => {
      if (!tourKey) return;
      setTourAssignments((prev) => {
        const next = { ...prev, [tourKey]: templateId };
        void saveJson(ASSIGNMENTS_STORAGE_KEY, next);
        return next;
      });
    },
    [tourKey]
  );

  const createTemplate = useCallback(
    (title: string) => {
      const clean = title.trim();
      if (!clean) return;
      const newId = makeId('kit');
      const newTpl: CustomChecklistTemplate = {
        id: newId,
        title: clean,
        items: [],
      };
      setTemplatesMap((prev) => {
        const next = { ...prev, [newId]: newTpl };
        void saveJson(TEMPLATES_STORAGE_KEY, next);
        return next;
      });
      if (tourKey) {
        setTourAssignments((prev) => {
          const next = { ...prev, [tourKey]: newId };
          void saveJson(ASSIGNMENTS_STORAGE_KEY, next);
          return next;
        });
      }
    },
    [tourKey]
  );

  const addItem = useCallback(
    (label: string) => {
      const clean = label.trim();
      if (!clean) return;
      setTemplatesMap((prev) => {
        const target = prev[activeTemplate.id] ?? activeTemplate;
        const nextTpl: CustomChecklistTemplate = {
          ...target,
          items: [...target.items, { id: makeId('item'), label: clean }],
        };
        const next = { ...prev, [activeTemplate.id]: nextTpl };
        void saveJson(TEMPLATES_STORAGE_KEY, next);
        return next;
      });
    },
    [activeTemplate]
  );

  const removeItem = useCallback(
    (itemId: string) => {
      setTemplatesMap((prev) => {
        const target = prev[activeTemplate.id] ?? activeTemplate;
        const nextTpl: CustomChecklistTemplate = {
          ...target,
          items: target.items.filter((i) => i.id !== itemId),
        };
        const next = { ...prev, [activeTemplate.id]: nextTpl };
        void saveJson(TEMPLATES_STORAGE_KEY, next);
        return next;
      });
    },
    [activeTemplate]
  );

  return {
    activeTemplate,
    allTemplates,
    checked,
    ready: hydrated,
    toggle,
    selectTemplateForTour,
    createTemplate,
    addItem,
    removeItem,
  };
}