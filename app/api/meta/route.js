import { requireUser, json } from '@/lib/auth';
import { crmUsers, crmMeta } from '@/lib/zoho';
import { getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const out = { me: auth.email, users: [], customerCategories: [], products: [], errors: [] };
  try { out.users = await crmUsers(); } catch (e) { out.errors.push(e.message); }
  try { Object.assign(out, await crmMeta()); } catch (e) { out.errors.push(e.message); }
  const crm = await getSetting('zoho_crm');
  const mail = await getSetting('zoho_mail');
  out.connected = { crm: !!crm, mail: !!mail };
  return json(out);
}
