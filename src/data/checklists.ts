export type ChecklistId =
  | 'standard'
  | 'mountain'
  | 'fatbike'
  | 'hg_snowshoe'
  | 'hg_ski';

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

const STANDARD_LABELS = [
  'Lefse',
  'Hot drink',
  'Cups',
  'Sleeping pad',
] as const;

export const CHECKLISTS: Record<ChecklistId, ChecklistTemplate> = {
  standard: {
    id: 'standard',
    title: 'Standard kit',
    items: [...STANDARD_LABELS].map(item),
  },
  mountain: {
    id: 'mountain',
    title: 'Hill Hike kit',
    items: [
      ...STANDARD_LABELS,
      'Shovel',
      'Probe',
      'Goggles (if windy)',
    ].map(item),
  },
  fatbike: {
    id: 'fatbike',
    title: 'Fatbike kit',
    items: [
      ...STANDARD_LABELS,
      'Goggles',
      'Reflective vests',
      'Bike repair kit',
    ].map(item),
  },
  hg_snowshoe: {
    id: 'hg_snowshoe',
    title: 'HG Snowshoe kit',
    items: [
      ...STANDARD_LABELS,
      'Headlamps',
      'Matches',
      'Firewood',
      'Firepan',
      'Toboggans',
    ].map(item),
  },
  hg_ski: {
    id: 'hg_ski',
    title: 'HG / Charter Ski kit',
    items: [
      ...STANDARD_LABELS,
      'Skis',
      'Shoes',
    ].map(item),
  },
};

export function getChecklist(id: ChecklistId): ChecklistTemplate {
  return CHECKLISTS[id];
}