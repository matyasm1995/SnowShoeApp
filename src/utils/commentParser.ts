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
  'time change',
  'officially approved',
  'approved by',
  'changed to',
  'moved to',
];

const NON_GUEST_PATTERNS = [
  /\bneeds?\s+\d+\s+guides?\b/i,
  /\b\d+\s+guides?\s+needed\b/i,
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

  // 4. Explicit shoe / size / EU (including decimals like "42.5" and ranges like "EU 37-38" or "EU 42,5/43")
  const shoeExplicitRegex =
    /(?:shoe\s*size|shoe|size|str\.?|boot|eu)[:\s]*((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?)(?:\s*[-–/]\s*((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?))?\b/gi;
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

function maskDatesAndTimes(text: string): string {
  return text
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, ' ')
    .replace(/\b(?:0?[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])(?:\.\d{2,4})?\b/g, ' ');
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
  let scan = maskDatesAndTimes(text);

  // 1. Bare shoe ranges including half sizes like "37-38", "43/44", "42,5/43", "41.5-42"
  const rangeShoeRegex =
    /\b((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?)\s*[-–/]\s*((?:2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:[.,]5)?)\b/g;
  for (const m of scan.matchAll(rangeShoeRegex)) {
    if (m[1] && m[2]) {
      shoes.push(`${normalizeDecimal(m[1])}-${normalizeDecimal(m[2])}`);
      clean = clean.replace(m[0], ' ');
      scan = scan.replace(m[0], ' ');
    }
  }

  // 2. Bare height numbers (120 to 229, including decimals like 161,5 or 174.5)
  const bareHeightRegex = /\b((?:1[2-9]\d|2[0-2]\d)(?:[.,]\d)?)\b/g;
  for (const m of scan.matchAll(bareHeightRegex)) {
    if (m[1]) {
      heights.push(`${normalizeDecimal(m[1])} cm`);
      clean = clean.replace(m[0], ' ');
      scan = scan.replace(m[0], ' ');
    }
  }

  // 3. Remaining 2-3 digit bare numbers (including single-decimal weights/half-sizes like 45,8 / 58,9 / 42.5)
  const bareNums: { raw: string; display: string; val: number; isShoeCandidate: boolean }[] = [];
  const bareNumRegex = /\b(\d{2,3}(?:[.,]\d)?)\b/g;
  for (const m of scan.matchAll(bareNumRegex)) {
    if (m[1]) {
      const display = normalizeDecimal(m[1]);
      const val = parseFloat(display);
      if (val >= 20 && val <= 160) {
        const isHalfOrInt = Math.abs(val * 2 - Math.round(val * 2)) < 1e-6;
        bareNums.push({
          raw: m[0],
          display,
          val,
          isShoeCandidate: val >= 25 && val <= 52 && isHalfOrInt,
        });
      }
    }
  }

  if (bareNums.length > 0) {
    const remaining = [...bareNums];

    // Numbers > 52 (or non-half decimals like 45.8) cannot be EU shoe sizes -> weight
    for (let i = remaining.length - 1; i >= 0; i--) {
      const item = remaining[i]!;
      if (!item.isShoeCandidate && weights.length === 0 && item.val >= 30 && item.val <= 160) {
        weights.push(`${item.display} kg`);
        clean = clean.replace(new RegExp(`\\b${escapeRegex(item.raw)}\\b`), ' ');
        remaining.splice(i, 1);
      }
    }

    // Smallest valid EU 25..52 (int or .5) -> shoe size
    if (shoes.length === 0 && remaining.length > 0) {
      remaining.sort((a, b) => a.val - b.val);
      const shoeIdx = remaining.findIndex((c) => c.isShoeCandidate);
      if (shoeIdx >= 0) {
        const candidate = remaining[shoeIdx]!;
        shoes.push(candidate.display);
        clean = clean.replace(new RegExp(`\\b${escapeRegex(candidate.raw)}\\b`), ' ');
        remaining.splice(shoeIdx, 1);
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

function hasGuestDetails(candidate: ParsedCandidate): boolean {
  return Boolean(
    candidate.bootSize ||
      candidate.height ||
      candidate.weight ||
      candidate.medicalNotes
  );
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
    if (NON_GUEST_PATTERNS.some((re) => re.test(line))) continue;

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

/**
 * Parses separate comment/reply/note blocks independently so operational chatter
 * in one comment thread ("need 2 guides", "time change approved") is ignored
 * whenever another comment block contains actual structured guest measurements.
 * If no block has structured measurements, falls back to returning all blocks
 * so plain-name lists are never lost.
 */
export function parseGuestsFromCommentBlocks(blocks: string[]): ParsedCandidate[] {
  const parsedBlocks = blocks
    .map((b) => parseGuestsFromComment(b))
    .filter((list) => list.length > 0);

  if (parsedBlocks.length === 0) return [];

  const blocksWithDetails = parsedBlocks.filter((list) =>
    list.some((candidate) => hasGuestDetails(candidate))
  );

  const chosen = blocksWithDetails.length > 0 ? blocksWithDetails : parsedBlocks;
  return chosen.flat();
}