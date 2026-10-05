import { requireUser, json } from '@/lib/auth';
import { crmUsers, crmMeta } from '@/lib/zoho';
import { getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ?fresh=1 reloads salesmen and picklists from Zoho; otherwise a 15 minute copy is used.
export async function GET(req) {
  const auth = await requireUser(); if (auth.error) return auth.error;
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  const out = { me: auth.email, users: [], customerCategories: [], products: [], errors: [] };
  const [users, meta, crm, mail] = await Promise.allSettled([
    crmUsers({ fresh }), crmMeta(), getSetting('zoho_crm'), getSetting('zoho_mail'),
  ]);
  if (users.status === 'fulfilled') out.users = users.value; else out.errors.push(users.reason.message);
  if (meta.status === 'fulfilled') Object.assign(out, meta.value); else out.errors.push(meta.reason.message);
  out.connected = { crm: crm.status === 'fulfilled' && !!crm.value, mail: mail.status === 'fulfilled' && !!mail.value };
  return json(out);
}
