const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycby4gUdPhXv2xsAqEnhiRXnCdj8Z1k4A-MB29TE3foFGf1PprR49FGIlmF-UizJzVYhN/exec';

const RENTAL_CENTER_COL_INDEX = 2; // Column C
const GUIDES_ON_DUTY_COL_INDEX = 41; // Column AP
const STAFF_COL_START = 68;
const STAFF_COL_END = 105;
const MICHAL_CR_COL_INDEX = 95;

const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const AMBIGUOUS_WORD_INITIALS = new Set([
  'to', 'he', 'in', 'no', 'at', 'on', 'or', 'as', 'is', 'by', 'an',
  'am', 'pm', 'so', 'do', 'go', 'up', 'my', 'we', 'me', 'be', 'if',
  'of', 'it', 'us', 'ok',
]);

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inflateCompactV2(rows, totalColumns) {
  const colCount = Math.max(1, totalColumns || 120);
  const values = [];
  const fontLines = [];

  for (let r = 0; r < rows.length; r++) {
    const src = rows[r] || {};
    const vRow = new Array(colCount).fill('');
    const fRow = new Array(colCount).fill('');

    if (src.v) {
      for (const key of Object.keys(src.v)) {
        const c = parseInt(key, 10);
        if (c >= 0 && c < colCount) {
          vRow[c] = src.v[key] ?? '';
        }
      }
    }

    if (Array.isArray(src.f)) {
      for (const c of src.f) {
        if (c >= 0 && c < colCount) {
          fRow[c] = 'line-through';
        }
      }
    }

    values.push(vRow);
    fontLines.push(fRow);
  }

  return { values, fontLines };
}

function cellContainsGuideInitials(cellValue, guideInitials) {
  const targetClean = String(guideInitials || '').trim();
  if (!targetClean) return false;
  const targetLower = targetClean.toLowerCase();

  const raw = String(cellValue ?? '').trim();
  if (!raw) return false;

  const tokens = raw.split(/[^A-Za-z0-9ÆØÅæøå]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return false;

  const isAmbiguous = AMBIGUOUS_WORD_INITIALS.has(targetLower);
  const allShortInitials = tokens.every((t) => t.length <= 3 && !/^\d+$/.test(t));

  for (const token of tokens) {
    if (token.toLowerCase() !== targetLower) continue;
    if (!isAmbiguous) return true;
    if (/[A-ZÆØÅ]/.test(token) || allShortInitials) {
      return true;
    }
  }

  return false;
}

function isTourColumn(colIndex, headerText) {
  const clean = headerText.trim();
  if (!clean) return false;
  const lower = clean.toLowerCase();

  if (
    lower.includes('meeting') ||
    lower.includes('on duty') ||
    lower.includes('available guides') ||
    lower.includes('needed guides') ||
    lower.includes('workshop') ||
    lower.includes('tasks') ||
    lower.includes('deliver') ||
    lower.includes('pick up') ||
    lower.includes('extra opening') ||
    lower === 't-ø' ||
    lower === 't-o' ||
    lower === 'l-s' ||
    lower === 'forecast' ||
    lower === 'on board' ||
    lower === 'shop' ||
    lower === 'ship' ||
    lower === 'pax' ||
    lower === 'minibus' ||
    lower.includes('minibus driver') ||
    lower.includes('drivers on duty') ||
    lower.includes('driver on duty') ||
    lower.startsWith('caravelle')
  ) {
    return false;
  }

  const isRegularTour = colIndex >= 22 && colIndex <= 39;
  const isShipTour = colIndex >= 44 && colIndex <= 53;
  const isCharterTour = colIndex >= 54 && colIndex <= 63;

  return isRegularTour || isShipTour || isCharterTour;
}

function findRentalCenterColIndex(headerRow) {
  const maxScan = Math.min(10, headerRow.length - 1);
  for (let c = 0; c <= maxScan; c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('rental center') || h.includes('rental centre')) {
      return c;
    }
  }
  return RENTAL_CENTER_COL_INDEX;
}

function findGuidesOnDutyColIndex(headerRow) {
  for (let c = 20; c < Math.min(STAFF_COL_START, headerRow.length); c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (h.includes('guides on duty')) {
      return c;
    }
  }
  return GUIDES_ON_DUTY_COL_INDEX;
}

function findMinibusDriversColIndex(headerRow) {
  for (let c = 20; c < Math.min(STAFF_COL_START, headerRow.length); c++) {
    const h = normalizeHeader(headerRow[c]).toLowerCase();
    if (
      h.includes('minibus driver') ||
      h.includes('drivers on duty') ||
      h.includes('driver on duty')
    ) {
      return c;
    }
  }
  return -1;
}

function normalizeNameForMatch(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractStaffHeaderPrimaryName(rawHeader) {
  const withoutParens = rawHeader.replace(/\([^)]*\)/g, ' ');
  const beforePercent = withoutParens.split(/\d+\s*%/)[0] ?? withoutParens;
  return normalizeNameForMatch(beforePercent);
}

function extractHeaderParenInitials(rawHeader) {
  const out = [];
  for (const m of rawHeader.matchAll(/\(([^)]+)\)/g)) {
    const inside = (m[1] || '').trim().toLowerCase();
    if (/^[a-zæøå]{2,3}$/.test(inside)) {
      out.push(inside);
    }
  }
  return out;
}

function findStaffColumnIndex(headerRow, fullName, initials, matrix) {
  const targetNorm = normalizeNameForMatch(fullName || '');
  const targetFirst = targetNorm.split(' ')[0] || '';
  const targetInit = String(initials || '').trim().toLowerCase();
  const maxCol = Math.min(STAFF_COL_END, headerRow.length - 1);

  const columns = [];
  for (let c = STAFF_COL_START; c <= maxCol; c++) {
    const raw = normalizeHeader(headerRow[c]);
    if (!raw) continue;
    columns.push({
      c,
      raw,
      primary: extractStaffHeaderPrimaryName(raw),
      parenInits: extractHeaderParenInitials(raw),
    });
  }

  if (targetNorm) {
    for (const col of columns) {
      if (!col.primary) continue;
      if (
        col.primary === targetNorm ||
        targetNorm.startsWith(`${col.primary} `) ||
        (targetFirst.length >= 2 && col.primary === targetFirst)
      ) {
        return col.c;
      }
    }
  }

  if (targetInit) {
    for (const col of columns) {
      if (col.parenInits.includes(targetInit)) {
        return col.c;
      }
    }
  }

  if (targetFirst.length >= 2) {
    for (const col of columns) {
      const tokens = col.primary.split(' ').filter(Boolean);
      if (tokens.includes(targetFirst)) {
        return col.c;
      }
    }
  }

  if (targetInit && Array.isArray(matrix) && matrix.length > 2) {
    let bestCol = -1;
    let bestCount = 0;
    for (const col of columns) {
      let hits = 0;
      for (let r = 2; r < matrix.length; r++) {
        const cell = String(matrix[r]?.[col.c] || '').trim().toLowerCase();
        if (!cell) continue;
        if (cell === targetInit) {
          hits += 3;
        } else {
          const toks = cell.split(/[^a-z0-9æøå]+/).filter(Boolean);
          if (toks.includes(targetInit) && !isOnDutyMarker(cell)) {
            hits += 1;
          }
        }
      }
      if (hits > bestCount) {
        bestCount = hits;
        bestCol = col.c;
      }
    }
    if (bestCol !== -1) return bestCol;
  }

  if ((targetFirst === 'michal' || targetInit === 'mh') && headerRow.length > MICHAL_CR_COL_INDEX) {
    return MICHAL_CR_COL_INDEX;
  }

  return -1;
}

function isOnDutyMarker(cellLower) {
  return (
    cellLower.includes('work') ||
    cellLower.includes('rc') ||
    cellLower.includes('sato') ||
    cellLower.includes('first aid') ||
    cellLower.includes('training') ||
    cellLower.includes('inventory') ||
    cellLower.includes('email') ||
    cellLower.includes('guiding') ||
    cellLower.includes('course') ||
    cellLower.includes('military')
  );
}

function staffCellHasOwnInitialsToken(rawCell, guideInitials) {
  const targetLower = String(guideInitials || '').trim().toLowerCase();
  if (!targetLower) return false;
  const tokens = rawCell
    .toLowerCase()
    .split(/[^a-z0-9æøå]+/)
    .filter((t) => t.length > 0);
  return tokens.includes(targetLower);
}

function isDayOffMarker(rawCell, guideInitials) {
  const cellLower = rawCell.toLowerCase();
  if (!cellLower) return false;
  if (
    cellLower.includes('off') ||
    cellLower.includes('holiday') ||
    cellLower.includes('avspasering') ||
    cellLower.includes('unpaid') ||
    cellLower.includes('leave') ||
    cellLower.includes('request') ||
    cellLower.includes('permisjon') ||
    cellLower.includes('not available') ||
    cellLower.includes('unavailable')
  ) {
    return true;
  }
  const targetLower = String(guideInitials || '').trim().toLowerCase();
  if (targetLower && !AMBIGUOUS_WORD_INITIALS.has(targetLower) && staffCellHasOwnInitialsToken(rawCell, targetLower)) {
    return true;
  }
  if (targetLower && !isOnDutyMarker(cellLower) && staffCellHasOwnInitialsToken(rawCell, targetLower)) {
    return true;
  }
  return false;
}

function findRowIndexForMonthDay(matrix, monthIndex0, dayNumber) {
  if (!matrix || matrix.length < 3) return -1;
  const targetMonth = MONTH_NAMES[monthIndex0] || '';

  let currentMonth = '';
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    const col0 = String(row[0] || '').trim().toUpperCase();
    if (MONTH_NAMES.includes(col0)) {
      currentMonth = col0;
      continue;
    }

    const col1Day = parseInt(String(row[1] || '').trim(), 10);
    if (currentMonth === targetMonth && col1Day === dayNumber) {
      return r;
    }
  }

  return -1;
}

function hasAssignedTourOnRow(headerRow, row, fontLineRow, initials) {
  for (let c = 2; c < row.length; c++) {
    const headerTitle = normalizeHeader(headerRow[c]);
    if (!isTourColumn(c, headerTitle)) continue;

    const cellText = String(row[c] || '');
    const lowerCell = cellText.toLowerCase();
    if (
      !cellText ||
      lowerCell.includes('closed') ||
      lowerCell.includes('canceled') ||
      lowerCell.includes('cancelled')
    ) {
      continue;
    }

    const isStrikethrough = String(fontLineRow[c] || '').toLowerCase().includes('line-through');
    if (isStrikethrough) continue;

    if (cellContainsGuideInitials(cellText, initials)) {
      return true;
    }
  }
  return false;
}

function evaluateDayWorkStatus(matrix, fontLines, rowIdx, profile, cols) {
  const headerRow = matrix[1] || [];
  const row = matrix[rowIdx] || [];
  const fontLineRow = fontLines[rowIdx] || [];

  if (hasAssignedTourOnRow(headerRow, row, fontLineRow, profile.initials)) {
    return 'working';
  }

  const rawRental = String(row[cols.rentalColIdx] || '').trim();
  const rawGuides = String(row[cols.guidesColIdx] || '').trim();
  const rawDrivers = cols.driversColIdx >= 0 ? String(row[cols.driversColIdx] || '').trim() : '';

  if (
    cellContainsGuideInitials(rawRental, profile.initials) ||
    cellContainsGuideInitials(rawGuides, profile.initials) ||
    (rawDrivers && cellContainsGuideInitials(rawDrivers, profile.initials))
  ) {
    return 'working';
  }

  if (cols.staffColIdx === -1) {
    return profile.contractType === 'full-time' ? 'working' : 'day_off';
  }

  const rawCell = String(row[cols.staffColIdx] || '').trim();
  const cellLower = rawCell.toLowerCase();

  if (cellLower.length === 0) {
    return profile.contractType === 'full-time' ? 'working' : 'day_off';
  }

  if (isDayOffMarker(rawCell, profile.initials)) {
    return 'day_off';
  }

  if (isOnDutyMarker(cellLower)) {
    return 'working';
  }

  return profile.contractType === 'full-time' ? 'day_off' : 'working';
}

function getOsloTodayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
  return { year, month, day };
}

function formatIcsDate(dateUtc) {
  const y = dateUtc.getUTCFullYear();
  const m = String(dateUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateUtc.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function formatUtcStamp(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function escapeIcsText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldIcsLine(line) {
  if (line.length <= 70) return line;
  const parts = [];
  let remaining = line;
  let limit = 70;
  while (remaining.length > limit) {
    parts.push(remaining.slice(0, limit));
    remaining = remaining.slice(limit);
    limit = 69;
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts.join('\r\n ');
}

function buildIcsCalendar({ matrix, fontLines, profile, includeDaysOff, daysAhead }) {
  const headerRow = matrix[1] || [];
  const cols = {
    rentalColIdx: findRentalCenterColIndex(headerRow),
    guidesColIdx: findGuidesOnDutyColIndex(headerRow),
    driversColIdx: findMinibusDriversColIndex(headerRow),
    staffColIdx: findStaffColumnIndex(headerRow, profile.fullName, profile.initials, matrix),
  };

  const today = getOsloTodayParts();
  const baseUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dtStamp = formatUtcStamp(new Date());
  const uidPrefix = profile.initials.toLowerCase().replace(/[^a-z0-9]/g, '') || 'guide';
  const calLabel = profile.fullName
    ? `TO Schedule (${profile.fullName})`
    : `TO Schedule (${profile.initials.toUpperCase()})`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TO Guides//Work Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calLabel)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
    'X-PUBLISHED-TTL:PT4H',
  ];

  for (let offset = -1; offset <= daysAhead; offset++) {
    const startUtc = new Date(baseUtc.getTime() + offset * 86400000);
    const endUtc = new Date(baseUtc.getTime() + (offset + 1) * 86400000);

    const rowIdx = findRowIndexForMonthDay(
      matrix,
      startUtc.getUTCMonth(),
      startUtc.getUTCDate()
    );
    if (rowIdx === -1) continue;

    const status = evaluateDayWorkStatus(matrix, fontLines, rowIdx, profile, cols);
    if (status === 'day_off' && !includeDaysOff) continue;

    const ymd = formatIcsDate(startUtc);
    const nextYmd = formatIcsDate(endUtc);
    const isWorking = status === 'working';

    lines.push(
      'BEGIN:VEVENT',
      `UID:to-schedule-${uidPrefix}-${ymd}@toguides.app`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${ymd}`,
      `DTEND;VALUE=DATE:${nextYmd}`,
      `SUMMARY:${isWorking ? 'TO · Working' : 'TO · Day Off'}`,
      `DESCRIPTION:${escapeIcsText(
        isWorking
          ? 'Scheduled working day at Tromsø Outdoor (Sheet 1.6). Open TO Guides app for tour assignments and times.'
          : 'Scheduled day off from Tromsø Outdoor (Sheet 1.6).'
      )}`,
      `TRANSP:${isWorking ? 'OPAQUE' : 'TRANSPARENT'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function parseParams(url) {
  const initials = (url.searchParams.get('i') || url.searchParams.get('initials') || '').trim();
  const fullName = (url.searchParams.get('n') || url.searchParams.get('name') || '').trim();
  const contractRaw = (url.searchParams.get('c') || url.searchParams.get('contract') || 'ft')
    .trim()
    .toLowerCase();
  const contractType =
    contractRaw === 'pt' || contractRaw === 'part-time' ? 'part-time' : 'full-time';
  const includeDaysOff = (url.searchParams.get('off') || '1').trim() !== '0';
  const download = (url.searchParams.get('dl') || '0').trim() === '1';

  let daysAhead = parseInt(url.searchParams.get('days') || '90', 10);
  if (!Number.isFinite(daysAhead) || daysAhead < 7) daysAhead = 90;
  if (daysAhead > 90) daysAhead = 90;

  return {
    profile: { initials, fullName, contractType },
    includeDaysOff,
    download,
    daysAhead,
  };
}

function buildHeaders(download, initials) {
  const safeName = (initials || 'to')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const filename = `to-schedule-${safeName || 'guide'}.ics`;

  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
    'Cache-Control': 'public, max-age=900',
    'Access-Control-Allow-Origin': '*',
  };
}

export async function onRequestHead(context) {
  const url = new URL(context.request.url);
  const { profile, download } = parseParams(url);
  if (!profile.initials) {
    return new Response(null, { status: 400 });
  }
  return new Response(null, {
    status: 200,
    headers: buildHeaders(download, profile.initials),
  });
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const { profile, includeDaysOff, download, daysAhead } = parseParams(url);

    if (!profile.initials) {
      return new Response(
        'Missing required query parameter: i (guide initials, e.g. ?i=MH&n=Michal)',
        {
          status: 400,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }
      );
    }

    const upstreamUrl = `${SCRIPT_URL}?v=2&days=${daysAhead}`;
    const res = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return new Response(`Upstream schedule error (HTTP ${res.status})`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const data = await res.json();
    let matrix = [];
    let fontLines = [];

    if (data && Array.isArray(data.rows)) {
      const inflated = inflateCompactV2(data.rows, data.totalColumns || 120);
      matrix = inflated.values;
      fontLines = inflated.fontLines;
    } else if (data && Array.isArray(data.values)) {
      matrix = data.values;
      fontLines = Array.isArray(data.fontLines) ? data.fontLines : [];
    } else {
      return new Response('Unexpected upstream schedule payload', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const ics = buildIcsCalendar({
      matrix,
      fontLines,
      profile,
      includeDaysOff,
      daysAhead,
    });

    return new Response(ics, {
      status: 200,
      headers: buildHeaders(download, profile.initials),
    });
  } catch (err) {
    return new Response(`Calendar generation failed: ${err?.message || 'Unknown error'}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
