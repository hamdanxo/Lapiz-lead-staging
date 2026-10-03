import { NextResponse } from 'next/server';
import { pinOk } from '@/lib/pin';
import { crmUsers, crmMeta } from '@/lib/zoho';
import { insertDraft } from '@/lib/drafts';
import { normalizeUaePhone, validTrn } from '@/lib/text';

export const dynamic = 'force-dynamic';

// GET ?pin=1234 : check PIN, return salesmen and customer categories (live from CRM)
export async function GET(req) {
  const pin = new URL(req.url).searchParams.get('pin');
  if (!(await pinOk(pin))) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });
  let users = [];
  let categories = [];
  try { users = (await crmUsers()).map((u) => ({ id: u.id, name: u.name })); } catch {}
  try { categories = (await crmMeta()).customerCategories; } catch {}
  return NextResponse.json({ ok: true, users, categories });
}

export async function POST(req) {
  const b = await req.json();
  if (!(await pinOk(b.pin))) return NextResponse.json({ error: 'Wrong PIN' }, { status: 401 });

  const clean = (v, n = 300) => (v ? String(v).trim().slice(0, n) : null);
  const company = clean(b.company, 200);
  const category = clean(b.customer_category, 120);
  const potential = clean(b.potential, 1000);
  const contact = clean(b.contact_name, 120);

  if (!company) return NextResponse.json({ error: 'Company name is needed' }, { status: 400 });
  if (!category) return NextResponse.json({ error: 'Pick a customer category' }, { status: 400 });
  if (!potential || potential.length < 3) return NextResponse.json({ error: 'Potential of the lead is needed' }, { status: 400 });
  if (contact && /\d/.test(contact)) return NextResponse.json({ error: 'Contact person cannot contain numbers' }, { status: 400 });

  // Category must be a real CRM option, or Zoho will reject the lead later.
  try {
    const { customerCategories } = await crmMeta();
    if (customerCategories.length && !customerCategories.includes(category)) {
      return NextResponse.json({ error: 'Pick a customer category from the list' }, { status: 400 });
    }
  } catch {}

  let phone = null;
  if (b.phone && String(b.phone).trim()) {
    phone = normalizeUaePhone(b.phone);
    if (!phone) return NextResponse.json({ error: 'Phone must be a UAE number, e.g. 050 123 4567' }, { status: 400 });
  }

  let trn = null;
  if (b.trn && String(b.trn).trim()) {
    if (!validTrn(b.trn)) return NextResponse.json({ error: 'TRN must be exactly 15 digits' }, { status: 400 });
    trn = String(b.trn).replace(/\s/g, '');
  }

  const raw = [
    `Counter walk-in${b.staff ? ` (entered by ${clean(b.staff, 60)})` : ''}`,
    `Company: ${company}`,
    `Category: ${category}`,
    contact && `Contact: ${contact}`,
    phone && `Phone: ${phone}`,
    trn && `TRN: ${trn}`,
    `Potential: ${potential}`,
  ].filter(Boolean).join('\n');

  await insertDraft({
    source: 'Counter',
    status: 'draft',
    external_id: `counter:${crypto.randomUUID()}`,
    company,
    contact_name: contact,
    phone,
    trn,
    customer_category: category,
    notes: potential,
    salesman_id: clean(b.salesman_id, 40),
    created_by: clean(b.staff, 60),
    raw_text: raw,
  });
  return NextResponse.json({ ok: true });
}
