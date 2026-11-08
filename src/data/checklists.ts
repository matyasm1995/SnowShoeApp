export type ChecklistId = 'standard' | 'mountain';

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface ChecklistTemplate {
  id: ChecklistId;
  title: string;
  items: ChecklistItem[];
}

function item(label: string): ChecklistItem {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return { id, label };
}

export const CHECKLISTS: Record<ChecklistId, ChecklistTemplate> = {
  standard: {
    id: 'standard',
    title: 'Standard day kit',
    items: [
      'Hot blackcurrant juice thermoses',
      'Lefse snacks',
      'Drinking cups',
      'Water bottles',
      'Spare warm mittens',
      'Headlamps (checked battery)',
    ].map(item),
  },
  mountain: {
    id: 'mountain',
    title: 'Mountain kit',
    items: [
      'Standard day pack items',
      'Avalanche beacons, probes & shovels',
      'Emergency bivy / bothy bag',
      'Insulating foam sleeping pad',
      'Ski goggles (for blowing snow)',
    ].map(item),
  },
};

export function getChecklist(id: ChecklistId): ChecklistTemplate {
  return CHECKLISTS[id];
}
