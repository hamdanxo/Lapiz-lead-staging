import { NextResponse } from 'next/server';
import { pinOk } from '@/lib/pin';
import { crmUsers } from '@/lib/zoho';
import { insertDraft } from '@/lib/drafts';

export const dynamic = 'force-dynamic';

// GET ?pin=1234 : check PIN and return the salesman list for the dropdown
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (!(await pinOk(pin))) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  let users = [];
  try { users = (await crmUsers()).map((u) => ({ id: u.id, name: u.name })); } catch {}
  return NextResponse.json({ ok: true, users });
}

export async function POST(req) {
  const b = await req.json();
  if (!(await pinOk(b.pin))) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  const company = String(b.company || '').trim();
  if (!company) return NextResponse.json({ error: 'Company name is needed' }, { status: 400 });
  const clean = (v, n = 300) => (v ? String(v).trim().slice(0, n) : null);
  const raw = [
    `Counter walk-in${b.staff ? ` (entered by ${clean(b.staff, 60)})` : ''}`,
    `Company: ${company}`,
    b.contact_name && `Contact: ${b.contact_name}`,
    b.phone && `Phone: ${b.phone}`,
    b.approx_qty && `Qty: ${b.approx_qty}`,
    b.need && `Needs: ${b.need}`,
  ].filter(Boolean).join('\n');

  await insertDraft({
    source: 'Counter',
    status: 'draft',
    external_id: `counter:${crypto.randomUUID()}`,
    company: clean(company, 200),
    contact_name: clean(b.contact_name, 120),
    phone: clean(b.phone, 40),
    approx_qty: clean(b.approx_qty, 120),
    notes: clean(b.need, 1000),
    salesman_id: clean(b.salesman_id, 40),
    created_by: clean(b.staff, 60),
    raw_text: raw,
  });
  return NextResponse.json({ ok: true });
}
