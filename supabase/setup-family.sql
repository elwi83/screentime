-- Replace the parent email below. Create the three confirmed Auth users first.
-- Safe to rerun: existing balances, requests and edited rules are preserved.
begin;
do $$
declare
  v_parent uuid;
  v_max uuid;
  v_walter uuid;
begin
  select id into v_parent from auth.users where lower(email) = lower('REPLACE_WITH_PARENT_EMAIL');
  select id into v_max from auth.users where email = 'maximilian@children.screentime.invalid';
  select id into v_walter from auth.users where email = 'walter@children.screentime.invalid';
  if v_parent is null or v_max is null or v_walter is null then
    raise exception 'Skapa alla tre Auth-användare och ange förälderns e-postadress först.';
  end if;
  if v_parent in (v_max, v_walter) then raise exception 'Föräldern måste ha ett separat konto.'; end if;

  insert into public.profiles(id, name, role) values
    (v_parent, 'Förälder', 'parent'), (v_max, 'Maximilian', 'child'), (v_walter, 'Walter', 'child')
    on conflict (id) do nothing;

  insert into public.rules(child_id, title, description, reward, daily_limit, sort_order) values
    (v_max, 'Läsning', '10 min, höstlovs läsbingo.', 30, 3, 0),
    (v_walter, 'Läsning', '15 min.', 30, 3, 0),
    (v_max, 'Skrivning', '3 meningar. Fint skrivna med stor bokstav, mellanrum och punkt. Minst 4 ord per mening.', 60, 3, 1),
    (v_walter, 'Skrivning', '10 meningar (fokus beskrivande och rättstavning).', 60, 3, 1),
    (v_max, 'Matte', 'Öva uppställning, 5 tal/uppställningar fint uppställda och uträknade.', 30, 3, 2),
    (v_walter, 'Matte', 'Öva inför prov i Magma eller på papper, 15 min.', 30, 3, 2),
    (v_max, 'Utomhus', 'Skärmpaus, vara utomhus i 30 min i sträck (toabesök eller hämta nått snabbt inne är ok).', 30, 12, 3),
    (v_walter, 'Utomhus', 'Skärmpaus, vara utomhus i 30 min i sträck (toabesök eller hämta nått snabbt inne är ok).', 30, 12, 3),
    (v_max, 'Inomhus', 'Skärmpaus inomhus 60 min i sträck (TV = skärm).', 30, 6, 4),
    (v_walter, 'Inomhus', 'Skärmpaus inomhus 60 min i sträck (TV = skärm).', 30, 6, 4)
    on conflict (child_id, sort_order) do nothing;
end $$;
commit;
