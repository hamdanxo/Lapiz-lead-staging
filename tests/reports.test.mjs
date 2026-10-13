import test from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, monthsInRange, monthKey, dayKey, dubaiParts, summarise, toCsv } from '../lib/reports.js';

// Dubai is UTC+4, so midnight there is 20:00 UTC the day before. Every range below is
// half-open: "from" counts, "to" does not.
const WED = new Date('2026-10-14T09:00:00Z'); // Wednesday 14 Oct 2026, 13:00 in Dubai

test('Dubai calendar date, not the UTC one', () => {
  // 21:00 UTC is already the next morning in Dubai
  assert.deepEqual(dubaiParts('2026-10-13T21:00:00Z'), { y: 2026, m: 10, d: 14, weekday: 3 });
  assert.deepEqual(dubaiParts('2026-10-13T19:59:00Z'), { y: 2026, m: 10, d: 13, weekday: 2 });
  // a lead that came in at 00:30 Dubai on 1 October belongs to October, not September
  assert.equal(monthKey('2026-09-30T20:30:00Z'), '2026-10');
  assert.equal(monthKey('2026-09-30T19:59:59Z'), '2026-09');
  assert.equal(dayKey('2026-09-30T20:30:00Z'), '2026-10-01');
});

test('this week starts on Monday', () => {
  const r = periodRange('week', {}, WED);
  assert.equal(r.from, '2026-10-11T20:00:00.000Z'); // Monday 12 Oct, 00:00 Dubai
  assert.equal(r.to, '2026-10-18T20:00:00.000Z'); // Monday 19 Oct, 00:00 Dubai
  assert.equal(r.label, '12 Oct 2026 – 18 Oct 2026');
});

test('Sunday is the end of its week, Monday starts the next one', () => {
  // Sunday 18 Oct, 23:00 Dubai: still the week that started Monday 12 Oct
  assert.equal(periodRange('week', {}, new Date('2026-10-18T19:00:00Z')).from, '2026-10-11T20:00:00.000Z');
  // 00:30 Dubai on Monday 19 Oct (= Sunday 20:30 UTC): the new week
  assert.equal(periodRange('week', {}, new Date('2026-10-18T20:30:00Z')).from, '2026-10-18T20:00:00.000Z');
  // Monday itself looks back zero days
  assert.equal(periodRange('week', {}, new Date('2026-10-12T10:00:00Z')).from, '2026-10-11T20:00:00.000Z');
});

test('this month and last month', () => {
  assert.deepEqual(periodRange('month', {}, WED), {
    from: '2026-09-30T20:00:00.000Z',
    to: '2026-10-31T20:00:00.000Z',
    label: '1 Oct 2026 – 31 Oct 2026',
  });
  assert.equal(periodRange('last_month', {}, WED).from, '2026-08-31T20:00:00.000Z');
  assert.equal(periodRange('last_month', {}, WED).to, '2026-09-30T20:00:00.000Z');
  // January looks back into the previous year
  const jan = periodRange('last_month', {}, new Date('2026-01-05T09:00:00Z'));
  assert.equal(jan.from, '2025-11-30T20:00:00.000Z');
  assert.equal(jan.to, '2025-12-31T20:00:00.000Z');
});

test('a picked month and a picked year', () => {
  const feb = periodRange('pick_month', { month: '2026-02' });
  assert.equal(feb.from, '2026-01-31T20:00:00.000Z');
  assert.equal(feb.to, '2026-02-28T20:00:00.000Z'); // 2026 is not a leap year
  assert.equal(periodRange('pick_month', { month: '2024-02' }).to, '2024-02-29T20:00:00.000Z');
  // December rolls into January of the next year
  assert.equal(periodRange('pick_month', { month: '2026-12' }).to, '2026-12-31T20:00:00.000Z');

  const y = periodRange('pick_year', { year: '2025' });
  assert.equal(y.from, '2024-12-31T20:00:00.000Z');
  assert.equal(y.to, '2025-12-31T20:00:00.000Z');
  assert.equal(y.label, '1 Jan 2025 – 31 Dec 2025');

  assert.throws(() => periodRange('pick_month', {}), /Pick a month/);
  assert.throws(() => periodRange('pick_month', { month: '2026-13' }), /Pick a month/);
  assert.throws(() => periodRange('pick_year', { year: '26' }), /Pick a year/);
});

test('all time has no limits', () => {
  assert.deepEqual(periodRange('all', {}, WED), { from: null, to: null, label: 'All time' });
});

test('custom dates include the whole "to" day', () => {
  const r = periodRange('custom', { from: '2026-10-01', to: '2026-10-13' });
  assert.equal(r.from, '2026-09-30T20:00:00.000Z'); // 1 Oct, 00:00 Dubai
  assert.equal(r.to, '2026-10-13T20:00:00.000Z'); // midnight after 13 Oct, so 13 Oct counts
  assert.equal(r.label, '1 Oct 2026 – 13 Oct 2026');

  // one day only
  const one = periodRange('custom', { from: '2026-10-13', to: '2026-10-13' });
  assert.equal(new Date(one.to) - new Date(one.from), 86400000);
  assert.equal(one.label, '13 Oct 2026');

  // open-ended either way
  assert.equal(periodRange('custom', { from: '2026-10-01' }).to, null);
  assert.equal(periodRange('custom', { to: '2026-10-01' }).from, null);

  assert.throws(() => periodRange('custom', {}), /Pick a from or a to date/);
  assert.throws(() => periodRange('custom', { from: '2026-02-31' }), /valid from date/);
  assert.throws(() => periodRange('custom', { from: '13-10-2026' }), /valid from date/);
  assert.throws(() => periodRange('custom', { from: '2026-10-13', to: '2026-10-01' }), /before the from date/);
});

test('months in a period, gaps included, future months left out', () => {
  const year = periodRange('pick_year', { year: '2026' });
  // asked in October, so the year stops there instead of showing empty months ahead
  assert.deepEqual(monthsInRange(year.from, year.to, WED), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  // a finished period shows all of its months
  assert.deepEqual(monthsInRange(periodRange('pick_year', { year: '2025' }).from, periodRange('pick_year', { year: '2025' }).to, WED).length, 12);
  assert.deepEqual(monthsInRange(periodRange('month', {}, WED).from, periodRange('month', {}, WED).to, WED), ['2026-10']);
  // all time has no start, so the caller uses the months it actually has leads for
  assert.equal(monthsInRange(null, null, WED), null);
  // a period that has not started yet
  assert.deepEqual(monthsInRange('2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z', WED), []);
});

const leads = [
  { created_at: '2026-10-05T06:00:00Z', salesman_name: 'Rafiq', products: ['Mapei', 'Weber'], source: 'Email', company: 'Alpha' },
  { created_at: '2026-10-06T06:00:00Z', salesman_name: 'Rafiq', products: ['Mapei'], source: 'Counter', company: 'Beta' },
  { created_at: '2026-08-20T06:00:00Z', salesman_name: 'Suresh', products: ['Mapei', 'Mapei'], source: 'WhatsApp', company: 'Gamma' },
  { created_at: '2026-08-21T06:00:00Z', salesman_name: null, products: [], source: 'Mayur', company: 'Delta' },
];

test('counting by salesman, brand and month', () => {
  const range = periodRange('custom', { from: '2026-08-01', to: '2026-10-31' });
  const s = summarise(leads, range, WED);

  assert.equal(s.total, 4);
  assert.deepEqual(s.bySalesman, [
    { name: 'Rafiq', count: 2, share: 50 },
    { name: 'No salesman', count: 1, share: 25 },
    { name: 'Suresh', count: 1, share: 25 },
  ]);
  // one lead can carry several brands, so these add up to more than the total;
  // the same brand twice on one lead is still one lead
  assert.deepEqual(s.byBrand, [
    { name: 'Mapei', count: 3, share: 75 },
    { name: 'No brand', count: 1, share: 25 },
    { name: 'Weber', count: 1, share: 25 },
  ]);
  // September had none, but it is still a row so the gap is visible
  assert.deepEqual(s.byMonth, [
    { key: '2026-08', label: 'Aug 2026', count: 2 },
    { key: '2026-09', label: 'Sep 2026', count: 0 },
    { key: '2026-10', label: 'Oct 2026', count: 2 },
  ]);
});

test('counting nothing does not divide by zero', () => {
  const s = summarise([], periodRange('month', {}, WED), WED);
  assert.equal(s.total, 0);
  assert.deepEqual(s.bySalesman, []);
  assert.deepEqual(s.byMonth, [{ key: '2026-10', label: 'Oct 2026', count: 0 }]);
});

test('CSV has a BOM, Dubai dates and escaped commas', () => {
  const csv = toCsv([
    { created_at: '2026-09-30T20:30:00Z', pushed_at: '2026-10-02T11:00:00Z', company: 'Smith, Jones LLC', salesman_name: 'Rafiq', products: ['Mapei', 'Weber'], source: 'Email' },
    { created_at: '2026-10-05T06:00:00Z', pushed_at: null, company: 'He said "hi"', salesman_name: null, products: [], source: 'Counter' },
  ]);
  const lines = csv.split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(lines[0], '﻿Date in,Date sent,Company,Salesman,Brands,Source');
  assert.equal(lines[1], '2026-10-01,2026-10-02,"Smith, Jones LLC",Rafiq,Mapei; Weber,Email');
  assert.equal(lines[2], '2026-10-05,,"He said ""hi""",,,Counter');
});
