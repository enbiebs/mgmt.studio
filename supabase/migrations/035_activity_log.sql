-- Activity log: who changed what, and when, on each artist's shows, offers and money.
--
-- The DATABASE keeps it, not the app: every change to the watched tables is recorded however it
-- happened (a screen, an import, a background job), the person is taken from their login, and
-- nobody can edit or delete an entry (there are no write rules for users, only the triggers below).
-- Who may READ an entry follows the data itself: management side only, and only for what the
-- reader may see in that section (so a teammate without Finance never sees money changes, and a
-- demo artist's log is private to its owner like the rest of the demo).
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  workspace_id uuid not null,
  client_id    text not null,                -- no foreign key: removing an artist must not be blocked by, or leave stale, history rules
  actor_id     uuid,                         -- the login that did it; null = the system
  actor_label  text not null,                -- their name at the time (kept as written, even if they are renamed later)
  section      text not null,                -- tour / finance / legal: decides who may read it
  entity_type  text not null,                -- show, offer, offer_sheet, budget, settlement, invoice, expense, contract
  entity_id    text not null,
  action       text not null check (action in ('create', 'update', 'delete')),
  title        text,                         -- e.g. "Fabric · London"
  changes      jsonb not null default '{}'::jsonb,   -- { field: [before, after] }; big structured fields: { keys: [...] } or { array: true, from, to }
  count        integer not null default 1,   -- several quick creates/deletes by one person are merged into one entry
  titles       text[] not null default '{}'  -- the first few titles when merged
);
create index if not exists activity_log_client_idx on public.activity_log (client_id, created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index if not exists activity_log_workspace_idx on public.activity_log (workspace_id, created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists "activity_log read" on public.activity_log;
create policy "activity_log read" on public.activity_log for select to authenticated
  using (public.is_management_side(client_id) and public.can_see_item(client_id, section, entity_type, entity_id));
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- How an entry's subject reads: "Fabric · London", "INV-2026-007 to Sound LA", ...
create or replace function public.activity_title(tbl text, j jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case tbl
    when 'shows'        then concat_ws(' · ', nullif(j->>'venue', ''), nullif(j->>'city', ''))
    when 'tour_offers'  then concat_ws(' · ', nullif(j->>'venue', ''), nullif(j->>'city', ''))
    when 'budgets'      then nullif(j->>'name', '')
    when 'settlements'  then coalesce(nullif(j->>'event_name', ''), nullif(j->>'venue', ''), nullif(j->>'file_name', ''))
    when 'invoices'     then concat_ws(' to ', nullif(j->>'number', ''), nullif(j->>'to_name', ''))
    when 'expenses'     then concat_ws(' · ', nullif(j->>'vendor', ''), nullif(j->>'bill_number', ''), nullif(j->>'description', ''))
    when 'contracts'    then nullif(j->>'title', '')
    when 'offer_sheets' then 'V' || coalesce(j->>'version', '?')
    else null end
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  etype      text := TG_ARGV[1];
  sect       text := TG_ARGV[0];
  rec        jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  oldj       jsonb := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
  newj       jsonb := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
  cid        text := rec->>'client_id';
  eid        text := rec->>'id';
  ws         uuid;
  actor      uuid := auth.uid();
  label      text;
  ttl        text;
  changes    jsonb := '{}'::jsonb;
  k          text;
  nv         jsonb;
  ov         jsonb;
  prev       public.activity_log%rowtype;
  merged     jsonb;
  first_old  jsonb;
  skip       text[] := array['updated_at'] || case TG_TABLE_NAME when 'offer_sheets' then array['snapshot'] else '{}'::text[] end;
begin
  begin
    -- Removing a whole artist removes their rows one by one; that is not a change anyone made.
    select c.workspace_id into ws from public.clients c where c.id = cid;
    if ws is null then return null; end if;

    ttl := public.activity_title(TG_TABLE_NAME, rec);
    if TG_TABLE_NAME = 'offer_sheets' then
      ttl := concat_ws(' · ', ttl, (select o.venue from public.tour_offers o where o.id = rec->>'offer_id'));
    end if;

    if actor is null then
      label := 'The system';
    else
      select coalesce(nullif(p.name, ''), u.email::text, 'Someone') into label
        from auth.users u
        left join public.workspace_members wm on wm.user_id = u.id
        left join public.people p on p.id = wm.person_id
       where u.id = actor limit 1;
      label := coalesce(label, 'Someone');
    end if;

    if TG_OP = 'UPDATE' then
      -- what actually changed (a save that changes nothing leaves no trace)
      for k, nv in select key, value from jsonb_each(newj) loop
        continue when k = any(skip);
        ov := oldj -> k;
        continue when nv is not distinct from ov;
        -- an empty value and "no" / blank are the same thing (the app saves a never-set checkbox as false)
        continue when (case when nv is null or nv in ('null'::jsonb, '""'::jsonb, 'false'::jsonb) then null else nv end)
                      is not distinct from (case when ov is null or ov in ('null'::jsonb, '""'::jsonb, 'false'::jsonb) then null else ov end);
        if jsonb_typeof(nv) = 'object' or jsonb_typeof(ov) = 'object' then
          changes := changes || jsonb_build_object(k, jsonb_build_object('keys', coalesce((
            select jsonb_agg(distinct x.key) from (
              select a.key from jsonb_each(case when jsonb_typeof(nv) = 'object' then nv else '{}'::jsonb end) a
               where (case when jsonb_typeof(ov) = 'object' then ov else '{}'::jsonb end) -> a.key is distinct from a.value
              union
              select b.key from jsonb_each(case when jsonb_typeof(ov) = 'object' then ov else '{}'::jsonb end) b
               where not (case when jsonb_typeof(nv) = 'object' then nv else '{}'::jsonb end) ? b.key
            ) x), '[]'::jsonb)));
        elsif jsonb_typeof(nv) = 'array' or jsonb_typeof(ov) = 'array' then
          changes := changes || jsonb_build_object(k, jsonb_build_object('array', true,
            'from', case when jsonb_typeof(ov) = 'array' then jsonb_array_length(ov) else 0 end,
            'to',   case when jsonb_typeof(nv) = 'array' then jsonb_array_length(nv) else 0 end));
        else
          changes := changes || jsonb_build_object(k, jsonb_build_array(
            case when jsonb_typeof(ov) = 'string' and length(ov #>> '{}') > 160 then to_jsonb(left(ov #>> '{}', 160) || '…') else ov end,
            case when jsonb_typeof(nv) = 'string' and length(nv #>> '{}') > 160 then to_jsonb(left(nv #>> '{}', 160) || '…') else nv end));
        end if;
      end loop;
      if changes = '{}'::jsonb then return null; end if;

      -- the same person editing the same thing within ten minutes is one entry (keep the first
      -- "before" and the latest "after"; if it ends where it began, there's nothing to show)
      select * into prev from public.activity_log l
       where l.client_id = cid and l.entity_type = etype and l.entity_id = eid and l.action = 'update'
         and l.actor_id is not distinct from actor and l.created_at > now() - interval '10 minutes'
       order by l.created_at desc limit 1;
      if found then
        merged := prev.changes;
        for k, nv in select key, value from jsonb_each(changes) loop
          if merged ? k and jsonb_typeof(nv) = 'array' and jsonb_typeof(merged -> k) = 'array' then
            first_old := (merged -> k) -> 0;
            if first_old is not distinct from (nv -> 1) then merged := merged - k;
            else merged := jsonb_set(merged, array[k], jsonb_build_array(first_old, nv -> 1)); end if;
          else
            merged := jsonb_set(merged, array[k], nv, true);
          end if;
        end loop;
        if merged = '{}'::jsonb then
          delete from public.activity_log where id = prev.id;
        else
          update public.activity_log set changes = merged, created_at = now(), title = ttl where id = prev.id;
        end if;
        return null;
      end if;
    else
      -- several quick creates (or deletes) of one kind by one person - an import, say - become one entry
      select * into prev from public.activity_log l
       where l.client_id = cid and l.entity_type = etype and l.action = lower(case TG_OP when 'INSERT' then 'create' else 'delete' end)
         and l.actor_id is not distinct from actor and l.created_at > now() - interval '2 minutes'
       order by l.created_at desc limit 1;
      if found then
        update public.activity_log
           set count = count + 1, created_at = now(),
               titles = case when cardinality(titles) < 6 and ttl is not null then titles || ttl else titles end
         where id = prev.id;
        return null;
      end if;
    end if;

    insert into public.activity_log (workspace_id, client_id, actor_id, actor_label, section, entity_type, entity_id, action, title, changes, titles)
    values (ws, cid, actor, label, sect, etype, eid,
            case TG_OP when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
            ttl, changes, case when TG_OP <> 'UPDATE' and ttl is not null then array[ttl] else '{}'::text[] end);
  exception when others then
    -- Keeping the log must never stop someone saving their work.
    raise warning 'activity log skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.log_activity() from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select * from (values
      ('shows',        'tour',    'show'),
      ('tour_offers',  'tour',    'offer'),
      ('offer_sheets', 'tour',    'offer_sheet'),
      ('budgets',      'finance', 'budget'),
      ('settlements',  'finance', 'settlement'),
      ('invoices',     'finance', 'invoice'),
      ('expenses',     'finance', 'expense'),
      ('contracts',    'legal',   'contract')
    ) as v(tbl, sect, etype)
  loop
    execute format('drop trigger if exists activity_log_trg on public.%I', t.tbl);
    execute format('create trigger activity_log_trg after insert or update or delete on public.%I for each row execute function public.log_activity(%L, %L)', t.tbl, t.sect, t.etype);
  end loop;
end $$;
