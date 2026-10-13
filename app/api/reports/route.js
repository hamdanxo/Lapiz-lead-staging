import { db } from '@/lib/db';
import { requireUser, json } from '@/lib/auth';
import { periodRange, summarise, toCsv } from '@/lib/reports';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // All time reads every pushed lead, so give it room

// Only these columns are read, and the counting happens here, so the browser never
// downloads the leads table.
const COLUMNS = 'id, created_at, pushed_at, company, salesman_name, products, source, crm_lead_id';
const PAGE = 1000; // Supabase returns at most 1000 rows per select
const MAX_PAGES = 25; // 25 000 leads: years of Lapiz volume
const LIST_LIMIT = 200; // how many leads the table on screen shows; the CSV gets all of them

// GET /api/reports?period=month&month=2026-10&year=2026&from=&to=&salesman=&brand=&source=&format=csv
// Counts leads already sent to CRM (status 'pushed'), by created_at (the day the lead came in),
// grouped in Dubai time.
export async function GET(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const q = new URL(req.url).searchParams;
  const pick = (k) => (q.get(k) || '').trim();

  let range;
  try {
    range = periodRange(pick('period') || 'month', { month: pick('month'), year: pick('year'), from: pick('from'), to: pick('to') });
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  const filters = { salesman: pick('salesman'), brand: pick('brand'), source: pick('source') };
  let rows;
  try {
    rows = await pushedLeads(range, filters);
  } catch (e) {
    return json({ error: `Could not read the leads: ${e.message}` }, 500);
  }

  if (pick('format') === 'csv') {
    const stamp = (range.from || '').slice(0, 10) || 'all-time';
    return new Response(toCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="lapiz-leads-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return json({
    range,
    filters,
    ...summarise(rows, range),
    leads: rows.slice(0, LIST_LIMIT), // already newest first
    shown: Math.min(rows.length, LIST_LIMIT),
  });
}

// A one-value Postgres array, written out by hand and quoted, because passing ['Dulux Trade']
// to contains() would send {Dulux Trade} unquoted and break on a brand with a comma in it.
function arrayLiteral(value) {
  return `{"${String(value).replace(/(["\\])/g, '\\$1')}"}`;
}

// All pushed leads in the period, 1000 at a time, newest first.
async function pushedLeads(range, { salesman, brand, source }) {
  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let sel = db().from('drafts').select(COLUMNS).eq('status', 'pushed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }) // a tiebreaker, so paging never repeats or skips a lead
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (range.from) sel = sel.gte('created_at', range.from);
    if (range.to) sel = sel.lt('created_at', range.to);
    if (salesman) sel = sel.eq('salesman_name', salesman);
    if (source) sel = sel.eq('source', source);
    if (brand) sel = sel.contains('products', arrayLiteral(brand)); // products is a text[] column
    const { data, error } = await sel;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
