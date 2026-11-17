export type ContactCategory =
  | 'emergency'
  | 'company'
  | 'taxi_towing'
  | 'havila'
  | 'hurtigruten'
  | 'extracted';

export interface ContactEntry {
  id: string;
  name: string;
  category: ContactCategory;
  phone: string;
  secondaryPhone?: string;
  secondaryLabel?: string;
  email?: string;
  notes?: string;
  keywords: readonly string[];
}

export const ASSIST_STEPS: readonly { letter: string; title: string; detail: string }[] = [
  { letter: 'A', title: 'Assess situation', detail: 'Self-protection — eliminate further dangers.' },
  { letter: 'S', title: 'Stop Traffic', detail: 'Keep emergency access clear. Protect the accident scene.' },
  { letter: 'S', title: 'Send for Help', detail: 'Emergency call 113 (Ambulance).' },
  { letter: 'I', title: 'Initiate Rescue', detail: 'Start First Aid immediately.' },
  { letter: 'S', title: 'Situation Check', detail: 'Monitor patient and group safety.' },
  { letter: 'T', title: 'Transport', detail: 'Check if safe transport is possible.' },
];

export const CORE_CONTACTS: readonly ContactEntry[] = [
  {
    id: 'tromso-outdoor',
    name: 'Tromsø Outdoor AS',
    category: 'company',
    phone: '97575875',
    notes: 'Fredrik Langes gata 14, 9008 Tromsø',
    keywords: ['tromso outdoor', 'shop', 'office', 'base'],
  },
  {
    id: 'tomas',
    name: 'Tomas',
    category: 'company',
    phone: '45583744',
    notes: 'Operations / Manager',
    keywords: ['tomas'],
  },
  {
    id: 'magne',
    name: 'Magne',
    category: 'company',
    phone: '41581501',
    notes: 'Operations / Manager',
    keywords: ['magne'],
  },
  {
    id: 'falk-towing',
    name: 'Falk Tromsø (Towing)',
    category: 'taxi_towing',
    phone: '02222',
    notes: 'Vehicle towing & roadside assistance',
    keywords: ['falk', 'tow', 'towing'],
  },
  {
    id: 'tromso-taxi',
    name: 'Tromsø Taxi',
    category: 'taxi_towing',
    phone: '77603000',
    notes: 'Booking nr: 702155',
    keywords: ['taxi', 'tromso taxi'],
  },
  {
    id: 'din-taxi',
    name: 'Din Taxi',
    category: 'taxi_towing',
    phone: '02045',
    keywords: ['din taxi'],
  },
  {
    id: 'legevakt',
    name: 'Legevakt (Medical)',
    category: 'emergency',
    phone: '116117',
    notes: 'Non-life-threatening medical emergency',
    keywords: ['legevakt'],
  },
  {
    id: 'police',
    name: 'Police',
    category: 'emergency',
    phone: '112',
    keywords: ['police'],
  },
  {
    id: 'fire',
    name: 'Fire Department',
    category: 'emergency',
    phone: '110',
    keywords: ['fire'],
  },
];

export const SHIP_CONTACTS: readonly ContactEntry[] = [
  // Havila
  {
    id: 'havila-capella',
    name: 'Havila Capella',
    category: 'havila',
    phone: '97998091',
    secondaryPhone: '+4797998050',
    secondaryLabel: 'Reception',
    email: 'kystruten.shorex@havila.no',
    keywords: ['capella'],
  },
  {
    id: 'havila-castor',
    name: 'Havila Castor',
    category: 'havila',
    phone: '97998093',
    secondaryPhone: '+4797998060',
    secondaryLabel: 'Reception',
    email: 'kystruten.shorex@havila.no',
    keywords: ['castor'],
  },
  {
    id: 'havila-polaris',
    name: 'Havila Polaris',
    category: 'havila',
    phone: '97998095',
    secondaryPhone: '+4797998070',
    secondaryLabel: 'Reception',
    email: 'kystruten.shorex@havila.no',
    keywords: ['polaris'],
  },
  {
    id: 'havila-pollux',
    name: 'Havila Pollux',
    category: 'havila',
    phone: '97998097',
    secondaryPhone: '+4797998080',
    secondaryLabel: 'Reception',
    email: 'kystruten.shorex@havila.no',
    keywords: ['pollux'],
  },
  // Hurtigruten (HG)
  {
    id: 'hg-kong-harald',
    name: 'MS Kong Harald',
    category: 'hurtigruten',
    phone: '94169241',
    keywords: ['kong harald'],
  },
  {
    id: 'hg-nordkapp',
    name: 'MS Nordkapp',
    category: 'hurtigruten',
    phone: '48013450',
    keywords: ['nordkapp'],
  },
  {
    id: 'hg-nordlys',
    name: 'MS Nordlys',
    category: 'hurtigruten',
    phone: '99487278',
    keywords: ['nordlys'],
  },
  {
    id: 'hg-nordnorge',
    name: 'MS Nordnorge',
    category: 'hurtigruten',
    phone: '95967442',
    keywords: ['nordnorge'],
  },
  {
    id: 'hg-polarlys',
    name: 'MS Polarlys',
    category: 'hurtigruten',
    phone: '91367569',
    keywords: ['polarlys'],
  },
  {
    id: 'hg-richard-with',
    name: 'MS Richard With',
    category: 'hurtigruten',
    phone: '94785821',
    keywords: ['richard with'],
  },
  {
    id: 'hg-trollfjord',
    name: 'MS Trollfjord',
    category: 'hurtigruten',
    phone: '95478895',
    keywords: ['trollfjord'],
  },
  {
    id: 'hg-finnmarken',
    name: 'MS Finnmarken',
    category: 'hurtigruten',
    phone: '90678557',
    keywords: ['finnmarken'],
  },
  {
    id: 'hg-vesteralen',
    name: 'MS Vesterålen',
    category: 'hurtigruten',
    phone: '48018000',
    keywords: ['vesterålen', 'vesteralen'],
  },
  {
    id: 'hg-midnatsol',
    name: 'MS Midnatsol',
    category: 'hurtigruten',
    phone: '51007160',
    keywords: ['midnatsol'],
  },
];

export function matchContactsForTour(params: {
  shipName?: string | null;
  tourName?: string | null;
  rawText?: string | null;
  cellNote?: string | null;
  commentsText?: string | null;
}): ContactEntry[] {
  const combined = [
    params.shipName ?? '',
    params.tourName ?? '',
    params.rawText ?? '',
    params.cellNote ?? '',
    params.commentsText ?? '',
  ]
    .join(' ')
    .toLowerCase();

  const matched: ContactEntry[] = [];
  const seenPhones = new Set<string>();

  for (const ship of SHIP_CONTACTS) {
    if (ship.keywords.some((kw) => combined.includes(kw))) {
      matched.push(ship);
      seenPhones.add(ship.phone.replace(/\s+/g, ''));
    }
  }

  // Extract any inline Norwegian / international phone numbers from cell text or comments
  const noteSources = [
    params.rawText ?? '',
    params.cellNote ?? '',
    params.commentsText ?? '',
  ].join(' ');

  const phoneRegex = /(?:\+47\s?)?\b\d{2,3}\s?\d{2}\s?\d{2}\s?\d{2}\b|\b\d{8}\b/g;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = phoneRegex.exec(noteSources)) !== null) {
    const rawNum = m[0].trim();
    const compact = rawNum.replace(/\s+/g, '');
    if (compact.length >= 8 && !seenPhones.has(compact)) {
      seenPhones.add(compact);
      idx++;
      matched.push({
        id: `extracted-${idx}-${compact}`,
        name: 'Number from Tour Note',
        category: 'extracted',
        phone: rawNum,
        keywords: [],
      });
    }
  }

  return matched;
}