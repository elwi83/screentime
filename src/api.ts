import { createClient } from '@supabase/supabase-js';
import type { Database, Snapshot } from './types';
import type { TaskRequest } from './types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const supabase = url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_')
  ? createClient<Database>(url, key)
  : null;

export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) throw new Error('Supabase är inte anslutet.');
  const results = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('rules').select('*').order('sort_order'),
    loadRequests(),
    supabase.from('ledger').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of [results[0], results[1], results[3]]) if (result.error) throw result.error;
  return { profiles: results[0].data!, rules: results[1].data!, requests: results[2], entries: results[3].data! };
}

async function loadRequests(): Promise<TaskRequest[]> {
  const rows: TaskRequest[] = [];
  // Paginate so Supabase's row cap never hides pending requests or today's reserved slots.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase!.from('task_requests').select('*')
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
