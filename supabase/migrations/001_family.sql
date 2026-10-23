begin;

create table public.profiles (
  id uuid primary key references auth.users(id),
  name text not null check (length(name) between 1 and 80),
  role text not null check (role in ('parent', 'child')),
  balance integer not null default 0 check (balance >= 0)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles(id),
  title text not null check (length(title) between 1 and 80),
  description text not null check (length(trim(description)) between 1 and 2000),
  reward integer not null check (reward between 1 and 10000),
  daily_limit integer not null check (daily_limit between 1 and 100),
  sort_order integer not null,
  unique (child_id, sort_order)
);

create table public.task_requests (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles(id),
  rule_id uuid not null references public.rules(id),
  title text not null,
  reward integer not null check (reward between 1 and 10000),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  task_day date not null,
  created_at timestamptz not null default statement_timestamp(),
  reviewed_at timestamptz
);
create index request_slots on public.task_requests (child_id, rule_id, task_day, status);

create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles(id),
  amount integer not null check (amount <> 0),
  reason text not null,
  created_at timestamptz not null default statement_timestamp()
);
create index ledger_child_time on public.ledger (child_id, created_at desc);

create function public.is_parent() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'parent');
$$;

alter table public.profiles enable row level security;
alter table public.rules enable row level security;
alter table public.task_requests enable row level security;
alter table public.ledger enable row level security;

create policy profile_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_parent());
create policy rule_read on public.rules for select to authenticated
  using (child_id = auth.uid() or public.is_parent());
create policy request_read on public.task_requests for select to authenticated
  using (child_id = auth.uid() or public.is_parent());
create policy ledger_read on public.ledger for select to authenticated
  using (child_id = auth.uid() or public.is_parent());

create function public.submit_task(p_rule_id uuid, p_note text default '') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_rule public.rules;
  v_day date := (statement_timestamp() at time zone 'Europe/Stockholm')::date;
  v_count integer;
  v_id uuid;
begin
  -- The child lock serializes submissions, including simultaneous requests on two devices.
  perform 1 from public.profiles where id = auth.uid() and role = 'child' for update;
  if not found then raise exception 'Bara barn kan skicka in uppgifter.'; end if;
  select * into v_rule from public.rules
    where id = p_rule_id and child_id = auth.uid() for share;
  if not found then raise exception 'Uppgiften kunde inte hittas.'; end if;
  if p_note is null or length(p_note) > 500 then
    raise exception 'Anteckningen får vara högst 500 tecken.';
  end if;
  select count(*) into v_count from public.task_requests
    where child_id = auth.uid() and rule_id = p_rule_id and task_day = v_day
      and status in ('pending', 'approved');
  if v_count >= v_rule.daily_limit then raise exception 'Du har nått dagens gräns för uppgiften.'; end if;
  insert into public.task_requests(child_id, rule_id, title, reward, note, task_day)
    values (auth.uid(), p_rule_id, v_rule.title, v_rule.reward, trim(p_note), v_day)
    returning id into v_id;
  return v_id;
end;
$$;

create function public.review_task(p_request_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_request public.task_requests;
begin
  if not public.is_parent() then raise exception 'Bara föräldrar kan göra detta.'; end if;
  if p_approve is null then raise exception 'Välj godkänn eller avslå.'; end if;
  select * into v_request from public.task_requests where id = p_request_id for update;
  if not found then raise exception 'Förfrågan kunde inte hittas.'; end if;
  if v_request.status <> 'pending' then raise exception 'Förfrågan är redan hanterad.'; end if;
  update public.task_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_at = statement_timestamp()
    where id = p_request_id;
  if p_approve then
    update public.profiles set balance = balance + v_request.reward where id = v_request.child_id;
    insert into public.ledger(child_id, amount, reason)
      values (v_request.child_id, v_request.reward, v_request.title);
  end if;
end;
$$;

create function public.deduct_time(p_child_id uuid, p_minutes integer, p_kind text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_balance integer; v_cost integer;
begin
  if not public.is_parent() then raise exception 'Bara föräldrar kan göra detta.'; end if;
  if p_minutes is null or p_minutes not between 1 and 10000
    or p_kind is null or p_kind not in ('regular', 'youtube') then
    raise exception 'Ange giltig skärmtyp och hela minuter mellan 1 och 10 000.';
  end if;
  v_cost := p_minutes * case when p_kind = 'youtube' then 2 else 1 end;
  select balance into v_balance from public.profiles where id = p_child_id and role = 'child' for update;
  if not found then raise exception 'Barnet kunde inte hittas.'; end if;
  if v_balance < v_cost then raise exception 'Det finns inte tillräckligt med skärmtid.'; end if;
  update public.profiles set balance = balance - v_cost where id = p_child_id;
  insert into public.ledger(child_id, amount, reason)
    values (p_child_id, -v_cost,
      case when p_kind = 'youtube' then 'YouTube' else 'Skärmtid' end
      || ': ' || p_minutes || ' min' || case when p_kind = 'youtube' then ' × 2' else '' end);
end;
$$;

create function public.edit_rule(p_rule_id uuid, p_description text, p_reward integer, p_daily_limit integer)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_parent() then raise exception 'Bara föräldrar kan göra detta.'; end if;
  if p_description is null or length(trim(p_description)) not between 1 and 2000
    or p_reward is null or p_reward not between 1 and 10000
    or p_daily_limit is null or p_daily_limit not between 1 and 100 then
    raise exception 'Kontrollera beskrivning, belöning (1–10 000) och dagsgräns (1–100).';
  end if;
  update public.rules set description = trim(p_description), reward = p_reward, daily_limit = p_daily_limit
    where id = p_rule_id;
  if not found then raise exception 'Regeln kunde inte hittas.'; end if;
end;
$$;

revoke all on public.profiles, public.rules, public.task_requests, public.ledger from public, anon, authenticated;
grant select on public.profiles, public.rules, public.task_requests, public.ledger to authenticated;
revoke all on function public.is_parent(), public.submit_task(uuid, text),
  public.review_task(uuid, boolean), public.deduct_time(uuid, integer, text),
  public.edit_rule(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.is_parent(), public.submit_task(uuid, text),
  public.review_task(uuid, boolean), public.deduct_time(uuid, integer, text),
  public.edit_rule(uuid, text, integer, integer) to authenticated;

commit;
