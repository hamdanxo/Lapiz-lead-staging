import { createClient } from '@supabase/supabase-js';

// Server-only client. Uses the service role key, so it must never reach the browser.
let client;
export function db() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function getSetting(key, fallback = null) {
  const { data, error } = await db().from('settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(`settings read failed: ${error.message}`);
  return data ? data.value : fallback;
}

export async function setSetting(key, value) {
  const { error } = await db()
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`settings write failed: ${error.message}`);
}
