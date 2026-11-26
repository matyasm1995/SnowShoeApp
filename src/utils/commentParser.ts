export interface ParsedCandidate {
  name: string;
  bootSize: string;
  height: string;
  weight: string;
  medicalNotes: string;
}

const NON_GUEST_KEYWORDS = [
  'minibus',
  'caravelle',
  'kai 8',
  'kai 21',
  'breivika',
  'radisson',
  'meeting time',
  'closed',
  'canceled',
  'cancelled',
  'training',
  'hotel',
  'airbnb',
  'tour leader',
  'call',
];

function extractMedicalNotes(text: string): { notes: string[]; cleanText: string } {
  const flags = [
    'vegan',
    'vegetarian',
    'gluten-free',
    'gluten free',
    'celiac',
    'nut allergy',
    'allergy',
    'asthma',
    'knee',
    'diabetes',
    'pregnant',
  ];

  const found: string[] = [];
  let cleanText = text;

  for (const flag of flags) {
    const reg = new RegExp(`\\b${flag}\\b`, 'gi');
    if (reg.test(cleanText)) {
      found.push(flag);
      cleanText = cleanText.replace(reg, ' ');
    }
  }

  return { notes: found, cleanText: cleanText.trim() };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDecimal(raw: string): string {
  return raw.replace(',', '.');
}

function extractExplicitMetrics(text: string): {
  heights: string[];
  weights: string[];
  shoes: string[];
  cleanText: string;
} {
  const heights: string[] = [];
  const weights: string[] = [];
  const shoes: string[] = [];
  let clean = text;

  // 1. Feet/inches (e.g. 5'11, 6ft 1)
  const ftRegex = /(?:\(|\b)([4-6])\s*(?:ft|'|’)\s*([0-9]|1[0-1])?(?:\s*(?:in|"|”))?(?:\b|\))/gi;
  for (const m of clean.matchAll(ftRegex)) {
    if (m[1]) {
      const feet = parseInt(m[1], 10);
      const inches = m[2] ? parseInt(m[2], 10) : 0;
      const cm = Math.round((feet * 12 + inches) * 2.54);
      heights.push(`${cm} cm`);
      clean = clean.replace(m[0], ' ');
    }
  }

  // 2. Explicit cm / h: height (e.g. 169cm, 161,5 cm, h: 180)
  const cmRegex =
    /(?:h|height)[:\s]*((?:1[2-9]\d|2[0-2]\d)(?:[.,]\d+)?)\s*(?:cm)?\b|\b((?:1[2-9]\d|2[0-2]\d)(?:[.,]\d+)?)\s*cm\b/gi;
  for (const m of clean.matchAll(cmRegex)) {
    const val = m[1] ?? m[2];
    if (val) {
      heights.push(`${normalizeDecimal(val)} cm`);
      clean = clean.replace(m[0], ' ');
    }
  }

  // 3. Explicit kg / lbs / w: weight (e.g. 58,9kg, 75 kg, 165 lbs, w: 82.5)
  const kgRegex =
    /(?:w|weight)[:\s]*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kilos?|lbs?)?\b|\b(\d{2,3}(?:[.,]\d+)?)\s*(?:kg|kilos?|lbs?)\b/gi;
  for (const m of clean.matchAll(kgRegex)) {
    const val = m[1] ?? m[2];
    if (val) {
      const num = parseFloat(normalizeDecimal(val));
      const isLbs = /lbs?/i.test(m[0]);
      const finalKg = isLbs ? String(Math.round(num * 0.453)) : normalizeDecimal(val);
      weights.push(`${finalKg} kg`);
      clean = clean.replace(m[0], ' ');
    }
  }

  // 4. Explicit shoe / size / EU (including decimals like "42.5" and ranges like "EU 37-38")
  const shoeExplicitRegex =
    /(?:shoe\s*size|shoe|size|str\.?|boot|eu)[:\s]*((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?)(?:\s*[-/]\s*((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?))?\b/gi;
  for (const m of clean.matchAll(shoeExplicitRegex)) {
    if (m[1]) {
      const first = normalizeDecimal(m[1]);
      const val = m[2] ? `${first}-${normalizeDecimal(m[2])}` : first;
      shoes.push(val);
      clean = clean.replace(m[0], ' ');
    }
  }

  return { heights, weights, shoes, cleanText: clean };
}

function extractBareMetrics(
  text: string,
  existing: { heights: string[]; weights: string[]; shoes: string[] }
): {
  heights: string[];
  weights: string[];
  shoes: string[];
  cleanText: string;
} {
  const heights = [...existing.heights];
  const weights = [...existing.weights];
  const shoes = [...existing.shoes];
  let clean = text;

  // 1. Bare hyphenated shoe ranges like "37-38", "41-42", "44-45"
  const rangeShoeRegex = /\b(2[5-9]|3[0-9]|4[0-9]|5[0-2])\s*[-–/]\s*(2[5-9]|3[0-9]|4[0-9]|5[0-2])\b/g;
  for (const m of clean.matchAll(rangeShoeRegex)) {
    if (m[1] && m[2]) {
      shoes.push(`${m[1]}-${m[2]}`);
      clean = clean.replace(m[0], ' ');
    }
  }

  // 2. Bare height numbers (120 to 229, including decimals like 161,5 or 174.5)
  const bareHeightRegex = /\b((?:1[2-9]\d|2[0-2]\d)(?:[.,]\d+)?)\b/g;
  for (const m of clean.matchAll(bareHeightRegex)) {
    if (m[1]) {
      heights.push(`${normalizeDecimal(m[1])} cm`);
      clean = clean.replace(m[0], ' ');
    }
  }

  // 3. Remaining 2-3 digit bare numbers (including decimals like 45,8 / 58,9 / 76.2)
  const bareNums: { raw: string; display: string; val: number }[] = [];
  const bareNumRegex = /\b(\d{2,3}(?:[.,]\d+)?)\b/g;
  for (const m of clean.matchAll(bareNumRegex)) {
    if (m[1]) {
      const display = normalizeDecimal(m[1]);
      const val = parseFloat(display);
      if (val >= 20 && val <= 160) {
        bareNums.push({ raw: m[0], display, val });
      }
    }
  }

  if (bareNums.length > 0) {
    const remaining = [...bareNums];

    // Numbers > 52 cannot be EU shoe sizes -> weight
    for (let i = remaining.length - 1; i >= 0; i--) {
      const item = remaining[i]!;
      if (item.val > 52 && weights.length === 0) {
        weights.push(`${item.display} kg`);
        clean = clean.replace(new RegExp(`\\b${escapeRegex(item.raw)}\\b`), ' ');
        remaining.splice(i, 1);
      }
    }

    // Smallest candidate in EU 25..52 -> shoe size
    if (shoes.length === 0 && remaining.length > 0) {
      remaining.sort((a, b) => a.val - b.val);
      const candidate = remaining[0];
      if (candidate && candidate.val >= 25 && candidate.val <= 52) {
        shoes.push(candidate.display);
        clean = clean.replace(new RegExp(`\\b${escapeRegex(candidate.raw)}\\b`), ' ');
        remaining.shift();
      }
    }

    // Next remaining -> weight
    if (weights.length === 0 && remaining.length > 0) {
      const wCand = remaining[0];
      if (wCand && wCand.val >= 30 && wCand.val <= 150) {
        weights.push(`${wCand.display} kg`);
        clean = clean.replace(new RegExp(`\\b${escapeRegex(wCand.raw)}\\b`), ' ');
      }
    }
  }

  return { heights, weights, shoes, cleanText: clean };
}

function sanitizeName(text: string): string {
  let clean = text
    .replace(/^[\s\d\-•.)/]+/, '')
    .replace(/[,;:/().\t]/g, ' ')
    .replace(/\b(?:is|are|was|and|with|has|have|shoe|size|eu|cm|kg|kilos?|lbs?|height|weight)\b/gi, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^escort\s+/i.test(clean)) {
    const rest = clean.replace(/^escort\s+/i, '').trim();
    if (rest.length > 0) {
      clean = `${rest} (Escort)`;
    }
  }

  return clean;
}

export function parseGuestsFromComment(rawComment: string): ParsedCandidate[] {
  if (!rawComment || typeof rawComment !== 'string') return [];

  const lines = rawComment
    .split(/\n|;|\d+\.\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const candidates: ParsedCandidate[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (NON_GUEST_KEYWORDS.some((kw) => lower.includes(kw))) continue;

    const { notes, cleanText: afterNotes } = extractMedicalNotes(line);
    const explicit = extractExplicitMetrics(afterNotes);
    const allMetrics = extractBareMetrics(explicit.cleanText, explicit);

    const cleanName = sanitizeName(allMetrics.cleanText);

    if (cleanName.length >= 2 && !/^\d+$/.test(cleanName)) {
      candidates.push({
        name: cleanName,
        bootSize: allMetrics.shoes[0] ?? '',
        height: allMetrics.heights.join(' / '),
        weight: allMetrics.weights[0] ?? '',
        medicalNotes: notes.join(', '),
      });
    }
  }

  return candidates;
}