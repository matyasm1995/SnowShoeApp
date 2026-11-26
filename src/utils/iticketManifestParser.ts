import { strFromU8, unzipSync } from 'fflate';

export interface ManifestGuest {
  name: string;
  partySize: number;
  phone: string;
  bookingRef: string;
  notes: string;
}

export interface ManifestTourSheet {
  sheetName: string;
  tourName: string;
  dateIso: string;
  startTime: string;
  pickupLocation: string;
  totalPax: number;
  guests: ManifestGuest[];
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)));
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRegex = /<(?:[a-zA-Z0-9_-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?si>/g;
  const tRegex = /<(?:[a-zA-Z0-9_-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?t>/g;
  let siMatch: RegExpExecArray | null;

  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1] ?? '';
    let combined = '';
    let tMatch: RegExpExecArray | null;
    tRegex.lastIndex = 0;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      combined += decodeXmlEntities(tMatch[1] ?? '');
    }
    strings.push(combined);
  }
  return strings;
}

function parseWorkbookSheets(
  workbookXml: string,
  relsXml: string
): { name: string; path: string }[] {
  const relMap = new Map<string, string>();
  const relRegex = /<(?:[a-zA-Z0-9_-]+:)?Relationship\b([^>]+)\/?>/g;
  let rm: RegExpExecArray | null;
  while ((rm = relRegex.exec(relsXml)) !== null) {
    const attrs = rm[1] ?? '';
    const idM = /Id="([^"]+)"/.exec(attrs);
    const targetM = /Target="([^"]+)"/.exec(attrs);
    if (idM?.[1] && targetM?.[1]) {
      const target = targetM[1].replace(/^\/+/, '');
      relMap.set(idM[1], target.startsWith('xl/') ? target : `xl/${target}`);
    }
  }

  const sheets: { name: string; path: string }[] = [];
  const sheetRegex = /<(?:[a-zA-Z0-9_-]+:)?sheet\b([^>]+)\/?>/g;
  let sm: RegExpExecArray | null;
  let idx = 1;
  while ((sm = sheetRegex.exec(workbookXml)) !== null) {
    const attrs = sm[1] ?? '';
    const nameM = /name="([^"]+)"/.exec(attrs);
    const ridM = /r:id="([^"]+)"/.exec(attrs);
    const name = decodeXmlEntities(nameM?.[1] ?? `Sheet ${idx}`);
    const path = (ridM?.[1] && relMap.get(ridM[1])) || `xl/worksheets/sheet${idx}.xml`;
    sheets.push({ name, path });
    idx++;
  }
  return sheets;
}

function parseWorksheetRows(
  sheetXml: string,
  sharedStrings: string[]
): Map<number, Map<string, string>> {
  const rows = new Map<number, Map<string, string>>();
  const rowRegex =
    /<(?:[a-zA-Z0-9_-]+:)?row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?row>/g;
  const cellRegex =
    /<(?:[a-zA-Z0-9_-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?c>)/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowNum = parseInt(rowMatch[1] ?? '0', 10);
    if (!Number.isFinite(rowNum) || rowNum <= 0) continue;

    const rowMap = new Map<string, string>();
    const rowBody = rowMatch[2] ?? '';
    let cellMatch: RegExpExecArray | null;
    cellRegex.lastIndex = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const refM = /r="([A-Z]+)\d+"/.exec(attrs);
      if (!refM?.[1]) continue;
      const col = refM[1];
      const typeM = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeM?.[1] ?? '';

      let value = '';
      if (cellType === 's') {
        const vM = /<(?:[a-zA-Z0-9_-]+:)?v>(\d+)<\/(?:[a-zA-Z0-9_-]+:)?v>/.exec(body);
        if (vM?.[1]) {
          value = sharedStrings[parseInt(vM[1], 10)] ?? '';
        }
      } else if (cellType === 'inlineStr') {
        const tRegex =
          /<(?:[a-zA-Z0-9_-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?t>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tRegex.exec(body)) !== null) {
          value += decodeXmlEntities(tm[1] ?? '');
        }
      } else {
        const vM = /<(?:[a-zA-Z0-9_-]+:)?v>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?v>/.exec(body);
        if (vM?.[1]) {
          value = decodeXmlEntities(vM[1]);
        }
      }

      if (value) {
        rowMap.set(col, value);
      }
    }

    if (rowMap.size > 0) {
      rows.set(rowNum, rowMap);
    }
  }

  return rows;
}

function cleanPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/[^+\d\s()-]/g, '').trim();
  return cleaned.replace(/\d/g, '').length >= 0 && /\d{6,}/.test(cleaned.replace(/\D/g, ''))
    ? cleaned
    : '';
}

function detectChannelTag(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('getyourguide') || /\bgyg[a-z0-9]{4,}\b/i.test(text)) return 'GYG';
  if (lower.includes('viator') || /\bbr-\d+\b/i.test(text)) return 'Viator';
  if (lower.includes('tripadvisor')) return 'TripAdvisor';
  return '';
}

function parseCustomerCell(rawCustomer: string): {
  name: string;
  phone: string;
  channel: string;
} {
  const lines = rawCustomer
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let name = '';
  let phone = '';
  let channel = '';

  for (const line of lines) {
    if (line.includes('@')) {
      if (!channel) channel = detectChannelTag(line);
      continue;
    }
    const maybePhone = cleanPhone(line);
    if (maybePhone && !/[a-zA-Z]{2,}/.test(line)) {
      if (!phone) phone = maybePhone;
      continue;
    }
    if (!name) {
      name = line.replace(/\s+/g, ' ').trim();
    }
  }

  return { name, phone, channel };
}

/**
 * Pure-JS parser for iTicket manifest.xlsx files (works offline on Web, iOS PWA, and Android).
 */
export function parseIticketManifestXlsx(bytes: Uint8Array): ManifestTourSheet[] {
  const unzipped = unzipSync(bytes);
  const workbookEntry = unzipped['xl/workbook.xml'];
  if (!workbookEntry) {
    throw new Error('Invalid Excel file (missing workbook.xml).');
  }

  const workbookXml = strFromU8(workbookEntry);
  const relsEntry = unzipped['xl/_rels/workbook.xml.rels'];
  const relsXml = relsEntry ? strFromU8(relsEntry) : '';
  const sharedEntry = unzipped['xl/sharedStrings.xml'];
  const sharedStrings = sharedEntry ? parseSharedStrings(strFromU8(sharedEntry)) : [];

  const sheets = parseWorkbookSheets(workbookXml, relsXml);
  const results: ManifestTourSheet[] = [];

  for (const sheet of sheets) {
    const entry = unzipped[sheet.path];
    if (!entry) continue;

    const sheetXml = strFromU8(entry);
    const rows = parseWorksheetRows(sheetXml, sharedStrings);
    const sortedRowNums = Array.from(rows.keys()).sort((a, b) => a - b);

    const r1 = rows.get(1);
    const r2 = rows.get(2);
    const tourName = (r1?.get('B') || sheet.name).trim();
    const dateIso = (r1?.get('E') || '').trim();
    const pickupLocation = (r2?.get('B') || '').trim();
    const startTime = (r2?.get('E') || '').trim();

    const guests: ManifestGuest[] = [];
    let headerPassed = false;

    for (const rn of sortedRowNums) {
      const r = rows.get(rn);
      if (!r) continue;
      const colA = (r.get('A') || '').trim();
      const colB = (r.get('B') || '').trim();
      const colC = (r.get('C') || '').trim();

      const aLower = colA.toLowerCase();
      const bLower = colB.toLowerCase();

      if (aLower === 'booking' && bLower === 'customer') {
        if (headerPassed) {
          // Second table in sheet is the SUMMARY table — stop here
          break;
        }
        headerPassed = true;
        continue;
      }

      if (!headerPassed) continue;
      if (aLower === 'totals' || bLower === 'summary' || aLower === 'tour') {
        break;
      }

      if (!colB) continue;

      const parsedCust = parseCustomerCell(colB);
      if (!parsedCust.name) continue;

      const paxNum = parseInt(colC, 10);
      const partySize = Number.isFinite(paxNum) && paxNum > 0 ? paxNum : 1;
      const refParts = [colA, parsedCust.channel].filter((p) => p.length > 0);

      guests.push({
        name: parsedCust.name,
        partySize,
        phone: parsedCust.phone,
        bookingRef: refParts.join(' · '),
        notes: '',
      });
    }

    const totalPax = guests.reduce((sum, g) => sum + g.partySize, 0);
    if (guests.length > 0) {
      results.push({
        sheetName: sheet.name,
        tourName,
        dateIso,
        startTime,
        pickupLocation,
        totalPax,
        guests,
      });
    }
  }

  return results;
}

/**
 * Fallback parser for text copied & pasted directly from the iTicket Manifest web page.
 * Handles blocks like:
 *   2 Kealeigh Mitchell
 *   Email: customer-...@reply.getyourguide.com
 *   Phone: +61419908254
 *   Ref: QCQ545LKL
 *   Ext Ref: GYG48YA53VNH
 */
export function parseIticketPastedText(rawText: string): ManifestGuest[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const guests: ManifestGuest[] = [];
  let current: ManifestGuest | null = null;
  let pendingPax: number | null = null;

  const flush = () => {
    if (current && current.name) {
      guests.push(current);
    }
    current = null;
  };

  const skipLine = (line: string): boolean => {
    const l = line.toLowerCase();
    return (
      l === 'show order' ||
      l === 'show order →' ||
      l.startsWith('manifest') ||
      l.includes('participant information') ||
      l.startsWith('tromsø outdoor') ||
      /^\d+x\s+/i.test(line)
    );
  };

  for (const line of lines) {
    if (skipLine(line)) continue;

    // Standalone party size number on its own line (common when copying mobile cards)
    if (/^\d{1,2}$/.test(line)) {
      const n = parseInt(line, 10);
      if (n >= 1 && n <= 40) {
        pendingPax = n;
      }
      continue;
    }

    if (/^email:/i.test(line)) {
      const tag = detectChannelTag(line);
      if (current && tag && !current.bookingRef.includes(tag)) {
        current.bookingRef = current.bookingRef ? `${current.bookingRef} · ${tag}` : tag;
      }
      continue;
    }

    if (/^phone:/i.test(line)) {
      const phone = cleanPhone(line.replace(/^phone:/i, ''));
      if (current && phone) current.phone = phone;
      continue;
    }

    if (/^ext\s*ref:/i.test(line)) {
      const tag = detectChannelTag(line);
      if (current && tag && !current.bookingRef.includes(tag)) {
        current.bookingRef = current.bookingRef ? `${current.bookingRef} · ${tag}` : tag;
      }
      continue;
    }

    if (/^ref:/i.test(line)) {
      const refVal = line.replace(/^ref:/i, '').trim();
      if (current && refVal) {
        current.bookingRef = current.bookingRef
          ? `${refVal} · ${current.bookingRef}`
          : refVal;
      }
      continue;
    }

    // "<N> <Guest Name>" on one line
    const numberedName = /^(\d{1,2})\s+([A-ZÆØÅ][A-Za-zÆØÅæøå'’.-]+(?:\s+[A-Za-zÆØÅæøå'’.-]+)+)$/.exec(
      line
    );
    if (numberedName && numberedName[1] && numberedName[2]) {
      flush();
      pendingPax = null;
      current = {
        name: numberedName[2].replace(/\s+/g, ' ').trim(),
        partySize: Math.max(1, parseInt(numberedName[1], 10)),
        phone: '',
        bookingRef: '',
        notes: '',
      };
      continue;
    }

    // Standalone phone line
    const maybePhone = cleanPhone(line);
    if (maybePhone && !/[a-zA-Z]{2,}/.test(line)) {
      if (current && !current.phone) current.phone = maybePhone;
      continue;
    }

    // Standalone booking ref like AQP846APS
    if (/^[A-Z0-9]{7,12}$/.test(line) && /\d/.test(line)) {
      if (current && !current.bookingRef) current.bookingRef = line;
      continue;
    }

    // Plain guest name (2+ capitalized words, no colon)
    if (
      !line.includes(':') &&
      !line.includes('@') &&
      /^[A-ZÆØÅ][A-Za-zÆØÅæøå'’.-]+(?:\s+[A-Za-zÆØÅæøå'’.-]+){1,4}$/.test(line)
    ) {
      flush();
      current = {
        name: line.replace(/\s+/g, ' ').trim(),
        partySize: pendingPax ?? 1,
        phone: '',
        bookingRef: '',
        notes: '',
      };
      pendingPax = null;
    }
  }

  flush();
  return guests;
}
