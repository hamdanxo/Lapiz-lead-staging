// Pure helpers for the Reports tab (no network), so they can be unit tested.
// All grouping is in Dubai time: the UAE is UTC+4 the whole year and never changes clocks,
// so shifting an instant by exactly four hours gives the local calendar date.

const DAY = 86400000;
export const DUBAI_OFFSET_MS = 4 * 3600000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// The calendar date in Dubai of an instant. weekday: Monday = 1 … Sunday = 7.
export function dubaiParts(when) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) throw new Error('That date could not be read.');
  const d = new Date(t + DUBAI_OFFSET_MS);
  const wd = d.getUTCDay();
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), weekday: wd === 0 ? 7 : wd };
}

// Midnight in Dubai on a calendar date, as the real instant. Out-of-range months and days roll
// over on purpose: dubaiMidnight(2026, 13, 1) is 1 January 2027, which is how "the month after"
// and "seven days later" are worked out below.
export function dubaiMidnight(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d) - DUBAI_OFFSET_MS);
}

export function monthKey(when) {
  const p = dubaiParts(when);
  return `${p.y}-${pad(p.m)}`;
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-');
  return `${MONTHS[Number(m) - 1] || '?'} ${y}`;
}

// 2026-10-13: the form Excel reads as a date.
export function dayKey(when) {
  const p = dubaiParts(when);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function dayLabel(when) {
  const p = dubaiParts(when);
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}

function badDay(which) {
  throw new Error(`Pick a valid ${which} date.`);
}

// A typed day, e.g. the custom from/to boxes. Rejects things like 2026-02-31.
function parseDay(text, which) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
  if (!m) return badDay(which);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const at = dubaiMidnight(y, mo, d);
  const back = dubaiParts(at);
  if (back.y !== y || back.m !== mo || back.d !== d) return badDay(which);
  return at;
}

// What the period picker asked for, as a half-open range [from, to): from counts, to does not.
// Both are ISO instants, or null for "no limit" (All time). opts: { month, year, from, to }.
export function periodRange(period, opts = {}, now = new Date()) {
  const t = dubaiParts(now);
  const span = (a, b) => ({ from: a ? a.toISOString() : null, to: b ? b.toISOString() : null, label: rangeLabel(a, b) });

  switch (period) {
    case 'week': {
      const back = t.weekday - 1; // weeks start on Monday
      return span(dubaiMidnight(t.y, t.m, t.d - back), dubaiMidnight(t.y, t.m, t.d - back + 7));
    }
    case 'month':
      return span(dubaiMidnight(t.y, t.m, 1), dubaiMidnight(t.y, t.m + 1, 1));
    case 'last_month':
      return span(dubaiMidnight(t.y, t.m - 1, 1), dubaiMidnight(t.y, t.m, 1));
    case 'pick_month': {
      const m = /^(\d{4})-(\d{2})$/.exec(String(opts.month || '').trim());
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error('Pick a month first.');
      return span(dubaiMidnight(Number(m[1]), Number(m[2]), 1), dubaiMidnight(Number(m[1]), Number(m[2]) + 1, 1));
    }
    case 'pick_year': {
      const y = String(opts.year || '').trim();
      if (!/^\d{4}$/.test(y)) throw new Error('Pick a year first.');
      return span(dubaiMidnight(Number(y), 1, 1), dubaiMidnight(Number(y) + 1, 1, 1));
    }
    case 'all':
      return { from: null, to: null, label: 'All time' };
    case 'custom': {
      const from = opts.from ? parseDay(opts.from, 'from') : null;
      const to = opts.to ? parseDay(opts.to, 'to') : null;
      if (!from && !to) throw new Error('Pick a from or a to date.');
      const end = to ? new Date(to.getTime() + DAY) : null; // the "to" day itself is included
      if (from && end && end <= from) throw new Error('The to date is before the from date.');
      return span(from, end);
    }
    default:
      throw new Error('Unknown period.');
  }
}

function rangeLabel(from, to) {
  const last = to ? new Date(to.getTime() - 1) : null; // the last day inside the range
  if (from && last) return dayLabel(from) === dayLabel(last) ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(last)}`;
  if (from) return `From ${dayLabel(from)}`;
  if (last) return `Up to ${dayLabel(last)}`;
  return 'All time';
}

// Every month the period covers, so a quiet month still shows as a 0 row. Months after this one
// are left out. Null when the period has no start (All time): then only months that have leads
// in them are listed.
export function monthsInRange(from, to, now = new Date()) {
  if (!from) return null;
  const start = dubaiParts(from);
  const lastInstant = to ? new Date(to).getTime() - 1 : new Date(now).getTime();
  const end = dubaiParts(Math.min(lastInstant, new Date(now).getTime()));
  const keys = [];
  let y = start.y;
  let m = start.m;
  while ((y < end.y || (y === end.y && m <= end.m)) && keys.length < 600) {
    keys.push(`${y}-${pad(m)}`);
    if (++m > 12) { m = 1; y++; }
  }
  return keys;
}

const NO_SALESMAN = 'No salesman';
const NO_BRAND = 'No brand';

// All the counting. Leads are counted by created_at (the day the lead came in), in Dubai time.
// One lead can have several brands, so the brand counts add up to more than the total.
export function summarise(rows, range = {}, now = new Date()) {
  const list = rows || [];
  const total = list.length;
  const salesman = new Map();
  const brand = new Map();
  const month = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

  for (const r of list) {
    bump(salesman, r.salesman_name || NO_SALESMAN);
    const brands = [...new Set((r.products || []).filter(Boolean))];
    if (brands.length) for (const b of brands) bump(brand, b);
    else bump(brand, NO_BRAND);
    bump(month, monthKey(r.created_at));
  }

  const share = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);
  const shaped = (map) => [...map].map(([name, count]) => ({ name, count, share: share(count) })).sort(byCount);
  const keys = [...new Set([...(monthsInRange(range.from, range.to, now) || []), ...month.keys()])].sort();

  return {
    total,
    bySalesman: shaped(salesman),
    byBrand: shaped(brand),
    byMonth: keys.map((key) => ({ key, label: monthLabel(key), count: month.get(key) || 0 })),
  };
}

// CSV for Excel: a BOM first so Arabic company names are not mangled, and CRLF line ends.
const CSV_HEAD = ['Date in', 'Date sent', 'Company', 'Salesman', 'Brands', 'Source'];
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows) {
  const lines = [CSV_HEAD.join(',')];
  for (const r of rows || []) {
    lines.push([
      dayKey(r.created_at),
      r.pushed_at ? dayKey(r.pushed_at) : '',
      r.company,
      r.salesman_name,
      (r.products || []).join('; '),
      r.source,
    ].map(cell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
