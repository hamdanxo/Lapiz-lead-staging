import { requireUser, json } from '@/lib/auth';
import { runFetch } from '@/lib/drafts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const auth = await requireUser(); if (auth.error) return auth.error;
  return json(await runFetch());
}
