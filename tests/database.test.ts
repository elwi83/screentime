import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const parent = '00000000-0000-4000-8000-000000000001';
const max = '00000000-0000-4000-8000-000000000002';
const walter = '00000000-0000-4000-8000-000000000003';
const stranger = '00000000-0000-4000-8000-000000000004';
let db: PGlite;
let maxRule: string;
let walterRule: string;
const setup = readFileSync(new URL('../supabase/setup-family.sql', import.meta.url), 'utf8')
  .replace('REPLACE_WITH_PARENT_EMAIL', 'parent@example.com');

async function asUser(id: string) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function submit(rule = maxRule) {
  const result = await db.query<{ id: string }>('select public.submit_task($1, $2) as id', [rule, 'Klart!']);
  return result.rows[0].id;
}
async function balance(id = max) {
  return (await db.query<{ balance: number }>('select balance from public.profiles where id = $1', [id])).rows[0]?.balance;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    grant usage on schema auth, public to authenticated, anon;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    insert into auth.users values
      ('${parent}', 'parent@example.com'),
      ('${max}', 'maximilian@children.screentime.invalid'),
      ('${walter}', 'walter@children.screentime.invalid'),
      ('${stranger}', 'stranger@example.com');
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/001_family.sql', import.meta.url), 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec('reset role; truncate public.ledger, public.task_requests, public.rules, public.profiles cascade;');
  await db.exec(setup);
  const rules = await db.query<{ id: string; child_id: string }>('select id, child_id from public.rules where sort_order = 0');
  maxRule = rules.rows.find(r => r.child_id === max)!.id;
  walterRule = rules.rows.find(r => r.child_id === walter)!.id;
});
afterAll(async () => { await db?.close(); });

describe('actual PostgreSQL functions and row-level policies', () => {
  it('seeds precisely two children at zero and the corrected writing rule', async () => {
    await asUser(parent);
    expect((await db.query('select * from public.rules')).rows).toHaveLength(10);
    expect(await balance()).toBe(0);
    expect(await balance(walter)).toBe(0);
    const result = await db.query<{ description: string }>('select description from public.rules where child_id = $1 and sort_order = 1', [max]);
    expect(result.rows[0].description).toBe('3 meningar. Fint skrivna med stor bokstav, mellanrum och punkt. Minst 4 ord per mening.');
  });
  it('children only read their own data, and unrelated accounts read nothing', async () => {
    await asUser(max);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(1);
    expect((await db.query('select * from public.rules')).rows).toHaveLength(5);
    await expect(submit(walterRule)).rejects.toThrow('Uppgiften kunde inte hittas');
    await asUser(stranger);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(0);
    expect((await db.query('select * from public.rules')).rows).toHaveLength(0);
    await expect(submit()).rejects.toThrow('Bara barn');
    await expect(db.query('select public.deduct_time($1, 1, $2)', [max, 'regular'])).rejects.toThrow('Bara föräldrar');
  });
  it('denies unauthenticated reads and actions', async () => {
    await db.exec('set role anon');
    await expect(db.query('select * from public.profiles')).rejects.toThrow('permission denied');
    await expect(submit()).rejects.toThrow('permission denied');
  });
  it('denies direct balance updates, role escalation, fake claims and ledger writes', async () => {
    await asUser(max);
    await expect(db.query("update public.profiles set role = 'parent', balance = 1000")).rejects.toThrow('permission denied');
    await expect(db.query("insert into public.ledger(child_id,amount,reason) values ($1,1000,'fake')", [max])).rejects.toThrow('permission denied');
    await expect(db.query("delete from public.task_requests")).rejects.toThrow('permission denied');
    await expect(db.query("insert into public.task_requests default values")).rejects.toThrow('permission denied');
  });
  it('requires approval, credits exactly once, and records the ledger', async () => {
    await asUser(max);
    const id = await submit();
    expect(await balance()).toBe(0);
    await expect(db.query('select public.review_task($1, true)', [id])).rejects.toThrow('Bara föräldrar');
    await asUser(parent);
    await db.query('select public.review_task($1, true)', [id]);
    expect(await balance()).toBe(30);
    await expect(db.query('select public.review_task($1, true)', [id])).rejects.toThrow('redan hanterad');
    expect((await db.query('select * from public.ledger')).rows).toHaveLength(1);
  });
  it('enforces pending + approved daily limits and frees rejected slots', async () => {
    await asUser(max);
    const id = await submit();
    await submit(); await submit();
    await expect(submit()).rejects.toThrow('dagens gräns');
    await asUser(parent);
    await db.query('select public.review_task($1, false)', [id]);
    expect(await balance()).toBe(0);
    await asUser(max);
    await submit();
    await expect(submit()).rejects.toThrow('dagens gräns');
  });
  it('snapshots rewards and keeps old-day approvals on their original day', async () => {
    await asUser(max);
    const id = await submit();
    await db.exec('reset role');
    await db.query("update public.task_requests set task_day = task_day - 1 where id = $1", [id]);
    await asUser(parent);
    await db.query('select public.edit_rule($1, $2, 90, 1)', [maxRule, 'Ny regel']);
    await db.query('select public.review_task($1, true)', [id]);
    expect(await balance()).toBe(30);
    await asUser(max);
    await submit();
    await expect(submit()).rejects.toThrow('dagens gräns');
  });
  it('charges YouTube double, prevents overdrafts, and records deductions atomically', async () => {
    await asUser(max);
    const id = await submit();
    await asUser(parent);
    await db.query('select public.review_task($1, true)', [id]);
    await expect(db.query("select public.deduct_time($1, 16, 'youtube')", [max])).rejects.toThrow('inte tillräckligt');
    expect(await balance()).toBe(30);
    await db.query("select public.deduct_time($1, 15, 'youtube')", [max]);
    expect(await balance()).toBe(0);
    const ledger = await db.query<{ amount: number }>('select amount from public.ledger order by amount');
    expect(ledger.rows.map(r => r.amount)).toEqual([-30, 30]);
    await expect(db.query("select public.deduct_time($1, 1, 'regular')", [max])).rejects.toThrow('inte tillräckligt');
    expect((await db.query('select * from public.ledger')).rows).toHaveLength(2);
  });
  it('charges regular use at face value and does not touch the sibling', async () => {
    await asUser(max);
    const id = await submit();
    await asUser(parent);
    await db.query('select public.review_task($1, true)', [id]);
    await db.query("select public.deduct_time($1, 10, 'regular')", [max]);
    expect(await balance()).toBe(20);
    expect(await balance(walter)).toBe(0);
  });
  it('rejects invalid input and child rule edits', async () => {
    await asUser(max);
    await expect(db.query('select public.submit_task($1, $2)', [maxRule, 'x'.repeat(501)])).rejects.toThrow('500');
    await expect(db.query('select public.edit_rule($1, $2, 30, 3)', [maxRule, 'Ny'])).rejects.toThrow('Bara föräldrar');
    await asUser(parent);
    await expect(db.query('select public.edit_rule($1, $2, 0, 3)', [maxRule, 'Ny'])).rejects.toThrow('Kontrollera');
    await expect(db.query('select public.edit_rule($1, $2, 30, 0)', [maxRule, 'Ny'])).rejects.toThrow('Kontrollera');
    await expect(db.query("select public.deduct_time($1, -1, 'youtube')", [max])).rejects.toThrow('giltig');
    await expect(db.query("select public.deduct_time($1, 1, 'other')", [max])).rejects.toThrow('giltig');
  });
  it('attributes submissions to the server Stockholm date, and setup reruns preserve data', async () => {
    await asUser(max);
    const id = await submit();
    const day = await db.query<{ correct: boolean }>("select task_day = (statement_timestamp() at time zone 'Europe/Stockholm')::date as correct from public.task_requests where id = $1", [id]);
    expect(day.rows[0].correct).toBe(true);
    await asUser(parent);
    await db.query('select public.review_task($1, true)', [id]);
    await db.exec('reset role');
    await db.exec(setup);
    expect(await balance()).toBe(30);
    expect((await db.query('select * from public.task_requests')).rows).toHaveLength(1);
  });
});
