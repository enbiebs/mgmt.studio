-- Tests the trash (supabase/tests/066_trash.sql) against the live database. It APPLIES the trash inside the test, then ends with an
-- intentional error, so NOTHING is kept (not the table, not the functions, not the test data). Success looks like:
--   ERROR: ALL 066 CHECKS PASSED (rolled back)
-- The text between the two $apply$ markers is exactly supabase/tests/066_trash.sql (scripts/check-trash.ts fails if they differ).
do $test$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  inst text := '00000000-0000-0000-0000-000000000000';
  tag text := left(gen_random_uuid()::text, 6);
  owner uuid; cid text;
  u_all uuid := gen_random_uuid(); u_fin uuid := gen_random_uuid(); u_tour uuid := gen_random_uuid();
  m_all uuid := gen_random_uuid(); m_fin uuid := gen_random_uuid(); m_tour uuid := gen_random_uuid();
  tid text; tid2 text; res jsonb; n int; refused boolean; h0 jsonb; h1 jsonb; changed text[]; expected text[]; k text; spec jsonb; s text; got text[];
  id_show text := 'zz-show-' || tag; id_offer text := 'zz-offer-' || tag; id_inv text := 'zz-inv-' || tag; id_dep text := 'zz-dep-' || tag;
  id_exp text := 'zz-exp-' || tag; id_p text := 'zz-p-' || tag; id_bud text := 'zz-bud-' || tag; id_bud2 text := 'zz-bud2-' || tag;
  id_ti text := 'zz-ti-' || tag; id_set text := 'zz-set-' || tag; id_cm text := 'zz-cm-' || tag;
  cid2 text := 'zz-client-' || tag; id_inv2 text := 'zz-inv2-' || tag; id_run text := 'zz-run-' || tag; id_ti2 text := 'zz-ti2-' || tag;
  id_bud3 text := 'zz-bud3-' || tag; id_bud4 text := 'zz-bud4-' || tag; id_os text := 'zz-os-' || tag; id_alb text := 'zz-alb-' || tag;
  id_exp2 text := 'zz-exp2-' || tag; id_show7 text := 'zz-show7-' || tag; id_show8 text := 'zz-show8-' || tag; id_show9 text := 'zz-show9-' || tag;
  id_exp3 text := 'zz-exp3-' || tag; id_show10 text := 'zz-show10-' || tag; id_show11 text := 'zz-show11-' || tag; id_show12 text := 'zz-show12-' || tag; id_offer10 text := 'zz-offer10-' || tag;
  u_pp uuid := gen_random_uuid(); u_art uuid := gen_random_uuid(); m_pp uuid := gen_random_uuid(); m_art uuid := gen_random_uuid();
begin
  execute $apply$
-- The trash: shows, offers, invoices, bills, deposits and people are kept for 30 days after they are deleted, and can be put back.
-- This file is what gets applied for real (supabase/tests/066_trash_test.sql tests it, rolled back). Nothing here is applied until Eli says so.
--
-- How it works, in plain words:
--   * Deleting goes through ONE function inside the database (trash_delete): it checks the person's access, keeps a complete copy and
--     deletes, as a single all-or-nothing step, with the item locked meanwhile. So an item is never deleted without its copy, a copy never
--     exists for something that was not deleted, and nothing can slip in between. Putting a copy back (trash_restore) is also one step.
--     Both see everything a delete removes (the database's cascades are not limited to what that person can read), so the copy is complete.
--   * Nobody can write to the trash directly (no insert/update/delete rights). What a copy holds (the rows themselves, and the "who sees
--     what" rules the item had) sits in a second table that nobody can read at all except these functions; the list people see shows only
--     what was deleted, by whom, and when it expires.
--   * Whoever may see a copy must have access to EVERY part of the app it touches (a show's copy includes fee terms, a person's includes
--     crew rates), be on the management side, and not be someone the item was hidden from. A copy that has expired is no longer visible
--     or restorable; the daily clean-up (src/app/api/trash/purge) removes it and its stored files.
--   * Putting a copy back never overwrites a row that exists now, restores what it safely can when something around it has changed
--     since (and says so in plain words), and either brings the item itself back completely or not at all.
--
-- SPEC-JSON: {"kinds":{"show":{"noun":"Show","section":"tour","sections":["tour","deals","finance"],"itemType":"show","rootTable":"shows","rootNeeds":[{"column":"tour_offer_id","table":"tour_offers","onMissing":"clear","takenBy":"show_id"},{"column":"run_id","table":"runs","onMissing":"clear"}],"children":[{"table":"show_advances","by":{"column":"show_id","from":"root"}},{"table":"advance_contacts","by":{"column":"advance_id","from":"show_advances"}},{"table":"guest_list_entries","by":{"column":"show_id","from":"root"}},{"table":"show_deals","by":{"column":"show_id","from":"root"},"needs":[{"column":"invoice_id","table":"invoices","onMissing":"clear"}]},{"table":"travel_items","by":{"column":"show_id","from":"root"},"needs":[{"column":"run_id","table":"runs","onMissing":"clear"}]},{"table":"flight_legs","by":{"column":"travel_item_id","from":"travel_items"}},{"table":"travel_item_shows","by":[{"column":"show_id","from":"root"},{"column":"travel_item_id","from":"travel_items"}],"needs":[{"column":"travel_item_id","table":"travel_items","onMissing":"skip"}]},{"table":"settlement_shows","by":{"column":"show_id","from":"root"},"needs":[{"column":"settlement_id","table":"settlements","onMissing":"skip"}]},{"table":"expense_shows","by":{"column":"show_id","from":"root"},"needs":[{"column":"expense_id","table":"expenses","onMissing":"skip"}]}],"relinks":[{"table":"budgets","column":"show_id","by":"show_id","key":"id"},{"table":"tour_offers","column":"show_id","by":"show_id","key":"id"}]},"offer":{"noun":"Offer","section":"deals","sections":["deals","finance","tour"],"rootTable":"tour_offers","rootNeeds":[{"column":"show_id","table":"shows","onMissing":"clear","takenBy":"tour_offer_id"}],"children":[{"table":"budgets","by":{"column":"offer_id","from":"root"},"filter":{"column":"show_id","isNull":true},"needs":[{"column":"run_id","table":"runs","onMissing":"clear"}]},{"table":"offer_sheets","by":{"column":"offer_id","from":"root"}}],"relinks":[{"table":"shows","column":"tour_offer_id","by":"tour_offer_id","key":"id"},{"table":"budgets","column":"offer_id","by":"offer_id","key":"id","filter":{"column":"show_id","isNull":false}}]},"invoice":{"noun":"Invoice","section":"finance","sections":["finance","deals"],"itemType":"invoice","rootTable":"invoices","rootNeeds":[],"children":[{"table":"invoice_line_items","by":{"column":"invoice_id","from":"root"}}],"relinks":[{"table":"deposits","column":"invoice_id","by":"invoice_id","key":"id"},{"table":"show_deals","column":"invoice_id","by":"invoice_id","key":"show_id"},{"table":"bank_transactions","column":"invoice_id","by":"invoice_id","key":"id"}]},"bill":{"noun":"Bill","section":"finance","sections":["finance","tour"],"itemType":"expense","rootTable":"expenses","rootNeeds":[{"column":"vendor_id","table":"vendors","onMissing":"clear"},{"column":"run_id","table":"runs","onMissing":"clear"}],"children":[{"table":"expense_shows","by":{"column":"expense_id","from":"root"},"needs":[{"column":"show_id","table":"shows","onMissing":"skip"}]}],"relinks":[],"fileColumn":"bill_file_path"},"deposit":{"noun":"Deposit","section":"finance","sections":["finance"],"rootTable":"deposits","rootNeeds":[{"column":"invoice_id","table":"invoices","onMissing":"clear"}],"children":[],"relinks":[]},"person":{"noun":"Person","section":"team","sections":["team","tour","finance","music"],"rootTable":"people","rootNeeds":[],"children":[{"table":"crew_members","by":{"column":"person_id","from":"root"}},{"table":"crew_rates","by":{"column":"crew_member_id","from":"crew_members"}},{"table":"release_stakeholders","by":{"column":"person_id","from":"root"},"needs":[{"column":"album_id","table":"albums","onMissing":"skip"}]}],"relinks":[{"table":"workspace_members","column":"person_id","by":"person_id","key":"id"},{"table":"pending_invites","column":"person_id","by":"person_id","key":"id"}]}},"nouns":{"shows":"show","tour_offers":"offer","runs":"run","invoices":"invoice","expenses":"bill","settlements":"settlement","travel_items":"booking","albums":"release","vendors":"vendor","budgets":"budget","deposits":"deposit","bank_transactions":"bank transaction","workspace_members":"login","pending_invites":"invitation","show_deals":"deal","show_advances":"advance","advance_contacts":"advance contact","guest_list_entries":"guest","flight_legs":"flight leg","travel_item_shows":"booking link","expense_shows":"bill link","settlement_shows":"settlement link","crew_members":"crew role","crew_rates":"crew rate","release_stakeholders":"release contact","invoice_line_items":"invoice line","offer_sheets":"offer sheet","people":"person"},"keys":{"show_deals":"show_id","crew_rates":"crew_member_id"}}

create table public.trash_items (
  id         text primary key,
  client_id  text not null references public.clients(id) on delete cascade,
  kind       text not null check (kind in ('show', 'offer', 'invoice', 'bill', 'deposit', 'person')),
  section    text not null check (section in ('tour', 'deals', 'finance', 'team')),
  sections   text[] not null,                           -- every part of the app the copy touches
  item_type  text check (item_type in ('show', 'invoice', 'expense')),   -- what the "who sees what" rules can hide
  item_id    text not null,
  label      text not null,
  detail     text,
  files      text[] not null default '{}',              -- stored files kept until the copy expires (a bill's PDF)
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  check (expires_at > deleted_at),
  check ((kind = 'show' and section = 'tour') or (kind = 'offer' and section = 'deals')
      or (kind in ('invoice', 'bill', 'deposit') and section = 'finance') or (kind = 'person' and section = 'team'))
);
create index trash_items_client_idx on public.trash_items (client_id, deleted_at desc);
create index trash_items_expiry_idx on public.trash_items (expires_at);
alter table public.trash_items enable row level security;

-- what is needed to put a copy back: not readable by the app at all (row security on with no policy, and no rights)
create table public.trash_contents (
  trash_id    text primary key references public.trash_items(id) on delete cascade,
  bundle      jsonb not null,                           -- the item's row, the rows deleted with it, the links that were cleared
  access      jsonb not null default '[]'::jsonb,       -- the "who sees what" rules the item had
  hidden_from uuid[] not null default '{}'              -- the people it was hidden from
);
alter table public.trash_contents enable row level security;
revoke all on public.trash_contents from anon, authenticated;

-- ── who may see a copy ──
create function public.trash_can_see(p_trash_id text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.trash_items t join public.trash_contents c on c.trash_id = t.id
     where t.id = p_trash_id
       and t.expires_at > now()
       and public.is_management_side(t.client_id)
       and not exists (select 1 from unnest(t.sections) s where not public.has_section_access(t.client_id, s))
       and not exists (select 1 from public.workspace_members m join public.clients cl on cl.workspace_id = m.workspace_id
                        where m.user_id = auth.uid() and cl.id = t.client_id and m.id = any(c.hidden_from)))
$fn$;
revoke all on function public.trash_can_see(text) from public, anon;
grant execute on function public.trash_can_see(text) to authenticated;

create policy "trash select" on public.trash_items for select using (public.trash_can_see(id));
-- no insert / update / delete policy and no such rights: only the functions below write here
revoke all on public.trash_items from anon, authenticated;
grant select on public.trash_items to authenticated;

-- ── what each kind saves (the same description the app has in src/lib/trash.ts) ──
create function public.trash_spec() returns jsonb language sql immutable set search_path = '' as $fn$
  select '{"kinds":{"show":{"noun":"Show","section":"tour","sections":["tour","deals","finance"],"itemType":"show","rootTable":"shows","rootNeeds":[{"column":"tour_offer_id","table":"tour_offers","onMissing":"clear","takenBy":"show_id"},{"column":"run_id","table":"runs","onMissing":"clear"}],"children":[{"table":"show_advances","by":{"column":"show_id","from":"root"}},{"table":"advance_contacts","by":{"column":"advance_id","from":"show_advances"}},{"table":"guest_list_entries","by":{"column":"show_id","from":"root"}},{"table":"show_deals","by":{"column":"show_id","from":"root"},"needs":[{"column":"invoice_id","table":"invoices","onMissing":"clear"}]},{"table":"travel_items","by":{"column":"show_id","from":"root"},"needs":[{"column":"run_id","table":"runs","onMissing":"clear"}]},{"table":"flight_legs","by":{"column":"travel_item_id","from":"travel_items"}},{"table":"travel_item_shows","by":[{"column":"show_id","from":"root"},{"column":"travel_item_id","from":"travel_items"}],"needs":[{"column":"travel_item_id","table":"travel_items","onMissing":"skip"}]},{"table":"settlement_shows","by":{"column":"show_id","from":"root"},"needs":[{"column":"settlement_id","table":"settlements","onMissing":"skip"}]},{"table":"expense_shows","by":{"column":"show_id","from":"root"},"needs":[{"column":"expense_id","table":"expenses","onMissing":"skip"}]}],"relinks":[{"table":"budgets","column":"show_id","by":"show_id","key":"id"},{"table":"tour_offers","column":"show_id","by":"show_id","key":"id"}]},"offer":{"noun":"Offer","section":"deals","sections":["deals","finance","tour"],"rootTable":"tour_offers","rootNeeds":[{"column":"show_id","table":"shows","onMissing":"clear","takenBy":"tour_offer_id"}],"children":[{"table":"budgets","by":{"column":"offer_id","from":"root"},"filter":{"column":"show_id","isNull":true},"needs":[{"column":"run_id","table":"runs","onMissing":"clear"}]},{"table":"offer_sheets","by":{"column":"offer_id","from":"root"}}],"relinks":[{"table":"shows","column":"tour_offer_id","by":"tour_offer_id","key":"id"},{"table":"budgets","column":"offer_id","by":"offer_id","key":"id","filter":{"column":"show_id","isNull":false}}]},"invoice":{"noun":"Invoice","section":"finance","sections":["finance","deals"],"itemType":"invoice","rootTable":"invoices","rootNeeds":[],"children":[{"table":"invoice_line_items","by":{"column":"invoice_id","from":"root"}}],"relinks":[{"table":"deposits","column":"invoice_id","by":"invoice_id","key":"id"},{"table":"show_deals","column":"invoice_id","by":"invoice_id","key":"show_id"},{"table":"bank_transactions","column":"invoice_id","by":"invoice_id","key":"id"}]},"bill":{"noun":"Bill","section":"finance","sections":["finance","tour"],"itemType":"expense","rootTable":"expenses","rootNeeds":[{"column":"vendor_id","table":"vendors","onMissing":"clear"},{"column":"run_id","table":"runs","onMissing":"clear"}],"children":[{"table":"expense_shows","by":{"column":"expense_id","from":"root"},"needs":[{"column":"show_id","table":"shows","onMissing":"skip"}]}],"relinks":[],"fileColumn":"bill_file_path"},"deposit":{"noun":"Deposit","section":"finance","sections":["finance"],"rootTable":"deposits","rootNeeds":[{"column":"invoice_id","table":"invoices","onMissing":"clear"}],"children":[],"relinks":[]},"person":{"noun":"Person","section":"team","sections":["team","tour","finance","music"],"rootTable":"people","rootNeeds":[],"children":[{"table":"crew_members","by":{"column":"person_id","from":"root"}},{"table":"crew_rates","by":{"column":"crew_member_id","from":"crew_members"}},{"table":"release_stakeholders","by":{"column":"person_id","from":"root"},"needs":[{"column":"album_id","table":"albums","onMissing":"skip"}]}],"relinks":[{"table":"workspace_members","column":"person_id","by":"person_id","key":"id"},{"table":"pending_invites","column":"person_id","by":"person_id","key":"id"}]}},"nouns":{"shows":"show","tour_offers":"offer","runs":"run","invoices":"invoice","expenses":"bill","settlements":"settlement","travel_items":"booking","albums":"release","vendors":"vendor","budgets":"budget","deposits":"deposit","bank_transactions":"bank transaction","workspace_members":"login","pending_invites":"invitation","show_deals":"deal","show_advances":"advance","advance_contacts":"advance contact","guest_list_entries":"guest","flight_legs":"flight leg","travel_item_shows":"booking link","expense_shows":"bill link","settlement_shows":"settlement link","crew_members":"crew role","crew_rates":"crew rate","release_stakeholders":"release contact","invoice_line_items":"invoice line","offer_sheets":"offer sheet","people":"person"},"keys":{"show_deals":"show_id","crew_rates":"crew_member_id"}}'::jsonb
$fn$;
revoke all on function public.trash_spec() from public, anon, authenticated;

-- the columns of a table that can be written and that a saved row has (a generated column, such as show_deals.id, refuses a value; a column
-- added after the copy was made is simply left to its default)
create function public.trash_row_columns(p_table text, p_row jsonb) returns text language sql stable set search_path = '' as $fn$
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    from information_schema.columns where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER' and p_row ? column_name
$fn$;
revoke all on function public.trash_row_columns(text, jsonb) from public, anon, authenticated;

-- ── the copy must be complete: refuse to delete if the database would take something with the item that the trash does not know about ──
-- (a later change to the database that adds a table under shows, say, must be added to src/lib/trash.ts too; until then deleting that kind
-- fails loudly instead of quietly making incomplete copies)
create function public.trash_check_spec(p_kind text) returns void
language plpgsql stable set search_path = '' as $fn$
declare
  spec jsonb := public.trash_spec() -> 'kinds' -> p_kind;
  saved text[]; kept text[]; cascades text[]; unlinks text[]; missing text[];
begin
  select coalesce(array_agg(c ->> 'table'), '{}') into saved from jsonb_array_elements(spec -> 'children') c;
  select coalesce(array_agg(r ->> 'table' || '.' || (r ->> 'column')), '{}') into kept from jsonb_array_elements(spec -> 'relinks') r;
  with recursive cascade_from(tbl) as (
    select (select relname from pg_class where oid = c.conrelid) from pg_constraint c
      where c.contype = 'f' and c.confdeltype = 'c' and c.confrelid = ('public.' || (spec ->> 'rootTable'))::regclass
    union
    select (select relname from pg_class where oid = c.conrelid) from pg_constraint c join cascade_from f on c.confrelid = ('public.' || f.tbl)::regclass
      where c.contype = 'f' and c.confdeltype = 'c')
  select coalesce(array_agg(distinct tbl), '{}') into cascades from cascade_from;
  select coalesce(array_agg(distinct rel || '.' || col), '{}') into unlinks from (
    select (select relname from pg_class where oid = c.conrelid) rel, (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) col
      from pg_constraint c
     where c.contype = 'f' and c.confdeltype = 'n'
       and (select relname from pg_class where oid = c.confrelid) = any (array[spec ->> 'rootTable'] || saved)) q;
  select coalesce(array_agg(t), '{}') into missing from (
    select t from unnest(cascades) t where t <> all (saved)
    union all select u from unnest(unlinks) u where u <> all (kept)) m(t);
  if cardinality(missing) > 0 then
    raise exception 'The trash does not know everything a % takes with it (%): src/lib/trash.ts needs updating before this can be deleted.', p_kind, array_to_string(missing, ', ');
  end if;
end $fn$;
revoke all on function public.trash_check_spec(text) from public, anon, authenticated;

-- ── keeping the copy (only trash_delete calls this) ──
create function public.trash_take(p_kind text, p_id text, p_label text, p_detail text) returns text
language plpgsql security definer set search_path = '' as $fn$
declare
  allspec jsonb := public.trash_spec();
  spec jsonb := allspec -> 'kinds' -> p_kind;
  keys jsonb := allspec -> 'keys';
  root jsonb; cid text; itype text; child jsonb; ref jsonb; refs jsonb; rl jsonb; rows_json jsonb; ids jsonb; filt text;
  conds text[]; by_table jsonb := '{}'::jsonb; rows_out jsonb := '[]'::jsonb; relinks_out jsonb := '[]'::jsonb;
  acc jsonb := '[]'::jsonb; hid uuid[] := '{}'; fl text[] := '{}'; tid text;
begin
  if spec is null then raise exception 'Unknown kind %', p_kind; end if;
  execute format('select client_id from public.%I where id = $1', spec ->> 'rootTable') into cid using p_id;
  if cid is null then return null; end if;                  -- not in the database: nothing to keep a copy of
  itype := spec ->> 'itemType';
  if not (public.is_management_side(cid) and public.has_section_access(cid, spec ->> 'section', true)
          and (itype is null or public.can_see_item(cid, spec ->> 'section', itype, p_id, true))) then
    raise exception 'You do not have permission to delete that.' using errcode = '42501';
  end if;
  perform public.trash_check_spec(p_kind);
  -- only now is the item locked (until the delete is done), so nothing can be added to it or changed in between
  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', spec ->> 'rootTable') into root using p_id;
  if root is null then return null; end if;                 -- deleted by someone else in the meantime

  for child in select value from jsonb_array_elements(spec -> 'children') loop
    refs := case jsonb_typeof(child -> 'by') when 'array' then child -> 'by' else jsonb_build_array(child -> 'by') end;
    conds := '{}';
    for ref in select value from jsonb_array_elements(refs) loop
      if ref ->> 'from' = 'root' then
        conds := conds || format('c.%I = %L', ref ->> 'column', p_id);
      else
        conds := conds || format('c.%I::text in (select r ->> %L from jsonb_array_elements(%L::jsonb) r)',
                                 ref ->> 'column', coalesce(keys ->> (ref ->> 'from'), 'id'), coalesce((by_table -> (ref ->> 'from'))::text, '[]'));
      end if;
    end loop;
    filt := case when child ? 'filter'
                 then format(' and c.%I is %snull', child -> 'filter' ->> 'column', case when (child -> 'filter' ->> 'isNull')::boolean then '' else 'not ' end)
                 else '' end;
    execute format('select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from public.%I c where (%s)%s', child ->> 'table', array_to_string(conds, ' or '), filt) into rows_json;
    by_table := by_table || jsonb_build_object(child ->> 'table', rows_json);
    if jsonb_array_length(rows_json) > 0 then
      rows_out := rows_out || jsonb_build_array(jsonb_build_object('table', child ->> 'table', 'rows', rows_json));
    end if;
  end loop;

  for rl in select value from jsonb_array_elements(spec -> 'relinks') loop
    filt := case when rl ? 'filter'
                 then format(' and c.%I is %snull', rl -> 'filter' ->> 'column', case when (rl -> 'filter' ->> 'isNull')::boolean then '' else 'not ' end)
                 else '' end;
    execute format('select coalesce(jsonb_agg(c.%I::text), ''[]''::jsonb) from public.%I c where c.%I = $1%s', rl ->> 'key', rl ->> 'table', rl ->> 'by', filt) into ids using p_id;
    if jsonb_array_length(ids) > 0 then
      relinks_out := relinks_out || jsonb_build_array(jsonb_build_object('table', rl ->> 'table', 'column', rl ->> 'column', 'key', rl ->> 'key', 'ids', ids));
    end if;
  end loop;

  -- deleting a show, invoice or bill also removes the "who sees what" rules it had: keep them, and who it was hidden from
  if itype is not null then
    select coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb), coalesce(array_agg(ia.member_id) filter (where ia.effect = 'hide'), '{}')
      into acc, hid from public.item_access ia where ia.item_type = itype and ia.item_id = p_id;
  end if;
  -- a stored file is kept with the copy only if it is a PDF under this artist's own folder (the column itself can hold any text)
  if spec ? 'fileColumn' and nullif(root ->> (spec ->> 'fileColumn'), '') is not null
     and starts_with(root ->> (spec ->> 'fileColumn'), cid || '/') and (root ->> (spec ->> 'fileColumn')) like '%.pdf'
     and position('..' in (root ->> (spec ->> 'fileColumn'))) = 0 then
    fl := array[root ->> (spec ->> 'fileColumn')];
  end if;

  tid := 'trash-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.trash_items (id, client_id, kind, section, sections, item_type, item_id, label, detail, files, deleted_by)
  values (tid, cid, p_kind, spec ->> 'section', array(select jsonb_array_elements_text(spec -> 'sections')), itype, p_id,
          coalesce(nullif(p_label, ''), spec ->> 'noun'), nullif(p_detail, ''), fl, auth.uid());
  insert into public.trash_contents (trash_id, bundle, access, hidden_from)
  values (tid, jsonb_build_object('kind', p_kind, 'rootId', p_id, 'root', root, 'rows', rows_out, 'relinks', relinks_out), acc, hid);
  return tid;
end $fn$;
revoke all on function public.trash_take(text, text, text, text) from public, anon, authenticated;

-- ── deleting: keep the copy, then delete, in one step. Returns the copy's id (null when the item is not in the database). ──
create function public.trash_delete(p_kind text, p_id text, p_label text default null, p_detail text default null) returns text
language plpgsql security definer set search_path = '' as $fn$
declare tid text; root_table text := public.trash_spec() -> 'kinds' -> p_kind ->> 'rootTable';
begin
  tid := public.trash_take(p_kind, p_id, p_label, p_detail);
  if tid is null then return null; end if;
  -- a budget that has become a show's budget outlives its offer: it is let go of first (the database would delete it with the offer otherwise)
  if p_kind = 'offer' then update public.budgets set offer_id = null where offer_id = p_id and show_id is not null; end if;
  execute format('delete from public.%I where id = $1', root_table) using p_id;
  return tid;
end $fn$;
revoke all on function public.trash_delete(text, text, text, text) from public, anon;
grant execute on function public.trash_delete(text, text, text, text) to authenticated;

-- ── putting it back ──
create function public.trash_restore(p_trash_id text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  allspec jsonb := public.trash_spec();
  nouns jsonb := allspec -> 'nouns';
  keys jsonb := allspec -> 'keys';
  t public.trash_items; ct public.trash_contents; spec jsonb; b jsonb; root jsonb; rw jsonb; v jsonb; need jsonb; child jsonb; step jsonb; r jsonb; rl jsonb; known jsonb;
  notes text[] := '{}'; present boolean; taken boolean; skip boolean; cols text; n int; linked int; ids text[]; lost int; clash_name text; noun text; tbl text; keycol text;
begin
  select * into t from public.trash_items where id = p_trash_id for update;
  if not found or t.expires_at <= now() then return jsonb_build_object('status', 'missing', 'notes', '[]'::jsonb); end if;
  if not (public.trash_can_see(p_trash_id) and public.has_section_access(t.client_id, t.section, true)) then
    raise exception 'You do not have permission to put that back.' using errcode = '42501';
  end if;
  select * into ct from public.trash_contents where trash_id = p_trash_id;
  spec := allspec -> 'kinds' -> t.kind;
  b := ct.bundle;

  execute format('select exists (select 1 from public.%I where id = $1 and client_id = $2)', spec ->> 'rootTable') into present using t.item_id, t.client_id;
  if present then                                             -- it is already back (restored before, or made again): leave it alone
    delete from public.trash_items where id = p_trash_id;
    return jsonb_build_object('status', 'already', 'notes', '[]'::jsonb);
  end if;

  -- the item itself; its optional links are cleared when the other side has been deleted since
  root := b -> 'root';
  for need in select value from jsonb_array_elements(spec -> 'rootNeeds') loop
    v := root -> (need ->> 'column');
    if v is not null and jsonb_typeof(v) = 'string' then
      execute format('select exists (select 1 from public.%I where id = $1)', need ->> 'table') into present using (v #>> '{}');
      noun := coalesce(nouns ->> (need ->> 'table'), need ->> 'table');
      if not present then
        root := jsonb_set(root, array[need ->> 'column'], 'null'::jsonb);
        notes := notes || format('The link to the %s was dropped because that %s has been deleted.', noun, noun);
      elsif need ? 'takenBy' then
        -- it still exists, but has been linked to something else since: linking it here too would leave the two sides disagreeing
        execute format('select exists (select 1 from public.%I where id = $1 and %I is not null)', need ->> 'table', need ->> 'takenBy') into taken using (v #>> '{}');
        if taken then
          root := jsonb_set(root, array[need ->> 'column'], 'null'::jsonb);
          notes := notes || format('The link to the %s was dropped because that %s now belongs to something else.', noun, noun);
        end if;
      end if;
    end if;
  end loop;
  -- one email per artist: if someone else now has this person's email, they come back without it
  if t.kind = 'person' and nullif(btrim(root ->> 'email'), '') is not null then
    select p.name into clash_name from public.people p where p.client_id = t.client_id and lower(btrim(p.email)) = lower(btrim(root ->> 'email')) limit 1;
    if found then
      notes := notes || format('%s already has the email %s, so %s came back without it.', clash_name, root ->> 'email', root ->> 'name');
      root := jsonb_set(root, '{email}', 'null'::jsonb);
    end if;
  end if;
  cols := public.trash_row_columns(spec ->> 'rootTable', root);
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', spec ->> 'rootTable', cols, cols, spec ->> 'rootTable') using root;

  -- what hung off it, in order (each table only after the tables it points at). A row that cannot go back is left out and said so.
  for step in select value from jsonb_array_elements(b -> 'rows') loop
    tbl := step ->> 'table';
    select c into child from jsonb_array_elements(spec -> 'children') c where c ->> 'table' = tbl;
    if child is null then raise exception 'This copy names a table (%) that a % does not keep.', tbl, t.kind; end if;
    keycol := coalesce(keys ->> tbl, 'id');
    noun := coalesce(nouns ->> tbl, tbl);
    for r in select value from jsonb_array_elements(step -> 'rows') loop
      rw := r; skip := false;
      for need in select value from jsonb_array_elements(coalesce(child -> 'needs', '[]'::jsonb)) loop
        v := rw -> (need ->> 'column');
        if v is not null and jsonb_typeof(v) = 'string' then
          execute format('select exists (select 1 from public.%I where id = $1)', need ->> 'table') into present using (v #>> '{}');
          if not present then
            if need ->> 'onMissing' = 'skip' then
              notes := notes || format('A %s was left out because the %s it belongs to has been deleted.', noun, coalesce(nouns ->> (need ->> 'table'), need ->> 'table'));
              skip := true; exit;
            end if;
            rw := jsonb_set(rw, array[need ->> 'column'], 'null'::jsonb);
            notes := notes || format('The link to the %s was dropped because that %s has been deleted.', coalesce(nouns ->> (need ->> 'table'), need ->> 'table'), coalesce(nouns ->> (need ->> 'table'), need ->> 'table'));
          end if;
        end if;
      end loop;
      if not skip then
        cols := public.trash_row_columns(tbl, rw);
        begin
          execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict do nothing', tbl, cols, cols, tbl) using rw;
          get diagnostics n = row_count;
          if n = 0 then
            -- already there (it survived the delete) is fine; something else in its way is worth saying
            begin
              execute format('select exists (select 1 from public.%I where %I::text = $1)', tbl, keycol) into present using (rw ->> keycol);
            exception when undefined_column then present := true;          -- (a table with no single key column: nothing more to check)
            end;
            if not present then notes := notes || format('A %s was left out because something like it is already there.', noun); end if;
          end if;
        exception
          when foreign_key_violation then
            notes := notes || format('A %s could not be put back because something it depends on has changed, so it was left out.', noun);
          when unique_violation or check_violation or not_null_violation then
            notes := notes || format('A %s could not be put back because it clashes with something that exists now, so it was left out.', noun);
        end;
      end if;
    end loop;
  end loop;

  -- links the delete cleared are put back only for rows that still exist and are still unlinked
  for rl in select value from jsonb_array_elements(b -> 'relinks') loop
    select x into known from jsonb_array_elements(spec -> 'relinks') x
     where x ->> 'table' = rl ->> 'table' and x ->> 'column' = rl ->> 'column' and x ->> 'key' = rl ->> 'key';
    if known is null then raise exception 'This copy names a link (%.%) that a % does not keep.', rl ->> 'table', rl ->> 'column', t.kind; end if;
    select array_agg(x) into ids from jsonb_array_elements_text(rl -> 'ids') x;
    execute format('update public.%I set %I = $1 where %I::text = any($2) and %I is null', rl ->> 'table', rl ->> 'column', rl ->> 'key', rl ->> 'column') using t.item_id, ids;
    execute format('select count(*) from public.%I where %I::text = any($1) and %I = $2', rl ->> 'table', rl ->> 'key', rl ->> 'column') into linked using ids, t.item_id;
    lost := cardinality(ids) - linked;
    if lost > 0 then
      noun := coalesce(nouns ->> (rl ->> 'table'), rl ->> 'table');
      notes := notes || format('%s %s%s that used to be linked to it %s not linked back, because %s since been deleted or linked to something else.',
                               lost, noun, case when lost = 1 then '' else 's' end, case when lost = 1 then 'was' else 'were' end, case when lost = 1 then 'it has' else 'they have' end);
    end if;
  end loop;

  -- the "who sees what" rules it had, for people who are still here
  for r in select value from jsonb_array_elements(ct.access) loop
    if exists (select 1 from public.workspace_members m where m.id::text = r ->> 'member_id') then
      cols := public.trash_row_columns('item_access', r);
      begin
        execute format('insert into public.item_access (%s) select %s from jsonb_populate_record(null::public.item_access, $1) on conflict do nothing', cols, cols) using r;
      exception when foreign_key_violation or unique_violation or check_violation or not_null_violation then null;
      end;
    end if;
  end loop;

  delete from public.trash_items where id = p_trash_id;
  return jsonb_build_object('status', 'restored', 'notes', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(notes) x));
end $fn$;
revoke all on function public.trash_restore(text) from public, anon;
grant execute on function public.trash_restore(text) to authenticated;

-- ── "delete for good" ──
-- Returns the stored files that were kept with the copy, so the caller can remove them (after checking nothing live still uses them).
create function public.trash_discard(p_trash_id text) returns text[]
language plpgsql security definer set search_path = '' as $fn$
declare t public.trash_items;
begin
  select * into t from public.trash_items where id = p_trash_id for update;
  if not found then return '{}'; end if;
  if not (public.trash_can_see(p_trash_id) and public.has_section_access(t.client_id, t.section, true)) then
    raise exception 'You do not have permission to remove that.' using errcode = '42501';
  end if;
  delete from public.trash_items where id = p_trash_id;
  return t.files;
end $fn$;
revoke all on function public.trash_discard(text) from public, anon;
grant execute on function public.trash_discard(text) to authenticated;
  $apply$;

  -- a fingerprint of every table (except the change history, the trash itself and timestamps that triggers touch), read with full rights
  create function public.zz_fp() returns jsonb language plpgsql security definer set search_path = '' as $fn$
  declare t text; h text; out jsonb := '{}'::jsonb;
  begin
    for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('activity_log', 'trash_items', 'trash_contents') loop
      execute format('select md5(coalesce(string_agg((to_jsonb(x) - ''updated_at'')::text, ''|'' order by (to_jsonb(x) - ''updated_at'')::text), '''')) from public.%I x', t) into h;
      out := out || jsonb_build_object(t, h);
    end loop;
    return out;
  end $fn$;
  grant execute on function public.zz_fp() to authenticated;

  -- ── test data, on a real (non-demo) artist, and a second artist in the same company ──
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into cid from public.clients where workspace_id = noted and demo_owner is null order by created_at limit 1;
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at) values
    (u_all,  'zz-all-'  || tag || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_fin,  'zz-fin-'  || tag || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_tour, 'zz-tour-' || tag || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_pp,   'zz-pp-'   || tag || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_art,  'zz-art-'  || tag || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now());
  delete from public.workspace_members where user_id in (u_all, u_fin, u_tour, u_pp, u_art);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (m_all, noted, u_all, 'team', null), (m_fin, noted, u_fin, 'team', null), (m_tour, noted, u_tour, 'team', null),
    (m_pp, noted, u_pp, 'team', null), (m_art, noted, u_art, 'artist', cid);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit)
    select 'grant-zz-' || tag || '-' || g.sec, m_all, g.sec, cid, true from unnest(array['tour', 'deals', 'finance', 'team', 'music']) as g(sec);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('grant-zz-' || tag || '-f', m_fin, 'finance', cid, true), ('grant-zz-' || tag || '-t', m_tour, 'tour', cid, true),
    ('grant-zz-' || tag || '-pp', m_pp, 'admin', cid, true);                                                  -- a Point Person: admin for this artist

  insert into public.clients (id, workspace_id, name) values (cid2, noted, 'ZZ Other Artist');
  insert into public.invoices (id, client_id, number, to_name, category, status, issued_date, due_date) values (id_inv2, cid2, 'ZZ-2', 'ZZ Other', 'touring', 'sent', current_date, current_date + 30);

  insert into public.runs (id, client_id, name) values (id_run, cid, 'ZZ Run');
  insert into public.tour_offers (id, client_id, venue, city, country, date, promoter, guarantee, status) values (id_offer, cid, 'ZZ Venue', 'London', 'GB', current_date + 40, 'ZZ Promoter', 15000, 'confirmed');
  insert into public.shows (id, client_id, date, city, venue, time, tour_offer_id) values (id_show, cid, current_date + 40, 'London, UK', 'ZZ Venue', '21:00', id_offer);
  update public.tour_offers set show_id = id_show where id = id_offer;
  insert into public.show_advances (id, show_id) values ('zz-adv-' || tag, id_show);
  insert into public.advance_contacts (id, advance_id, role, name) values ('zz-ac-' || tag, 'zz-adv-' || tag, 'Production', 'Pat');
  insert into public.guest_list_entries (id, show_id, name) values ('zz-g-' || tag, id_show, 'A Guest');
  insert into public.invoices (id, client_id, number, to_name, category, status, issued_date, due_date) values (id_inv, cid, 'ZZ-1', 'ZZ Promoter', 'touring', 'sent', current_date - 5, current_date + 25);
  insert into public.invoice_line_items (invoice_id, description, quantity, rate) values (id_inv, 'Guarantee', 1, 15000);
  insert into public.show_deals (show_id, client_id, guarantee, invoice_id) values (id_show, cid, 15000, id_inv);
  insert into public.deposits (id, client_id, name, date, amount, invoice_id) values (id_dep, cid, 'ZZ deposit', current_date, 7500, id_inv);
  insert into public.expenses (id, client_id, description, vendor, amount, category, date, bill_file_path) values (id_exp, cid, 'Van', 'ZZ Vans', 400, 'travel', current_date, cid || '/zz-' || tag || '.pdf');
  insert into public.expense_shows (id, expense_id, show_id) values (id_exp || '-' || id_show, id_exp, id_show);
  insert into public.budgets (id, client_id, offer_id, show_id, name, lines, commissions) values
    (id_bud, cid, null, id_show, 'ZZ budget', '[]', '[]'), (id_bud2, cid, null, id_show, 'ZZ budget 2', '[]', '[]'),
    (id_bud3, cid, id_offer, null, 'ZZ offer budget', '[]', '[]'),                       -- the offer's own budget: deleted with it
    (id_bud4, cid, id_offer, id_show, 'ZZ show budget', '[]', '[]');                     -- a budget that became the show's: outlives the offer
  insert into public.offer_sheets (id, client_id, offer_id, version, snapshot) values (id_os, cid, id_offer, 1, '{}'::jsonb);
  insert into public.travel_items (id, client_id, kind) values (id_ti, cid, 'hotel');
  insert into public.travel_item_shows (id, travel_item_id, show_id) values (id_ti || '-' || id_show, id_ti, id_show);
  insert into public.travel_items (id, client_id, kind, show_id, run_id) values (id_ti2, cid, 'hotel', id_show, id_run);   -- an older kind of booking, tied to the show directly
  insert into public.flight_legs (id, travel_item_id) values ('zz-fl-' || tag, id_ti2);
  insert into public.settlements (id, client_id, fx, payout, total_due) values (id_set, cid, '{"USD":1}', '[]', 15000);
  insert into public.settlement_shows (settlement_id, show_id) values (id_set, id_show);
  insert into public.people (id, client_id, name, email, title) values (id_p, cid, 'ZZ Person', 'zz-' || tag || '@example.invalid', 'Tour Manager');
  insert into public.crew_members (id, client_id, role, person_id) values (id_cm, cid, 'tour-manager', id_p);
  insert into public.crew_rates (crew_member_id, client_id, rate_show) values (id_cm, cid, 450);
  insert into public.albums (id, client_id, title) values (id_alb, cid, 'ZZ Album');
  insert into public.release_stakeholders (id, album_id, role, person_id) values ('zz-rs-' || tag, id_alb, 'producer', id_p);
  update public.workspace_members set person_id = id_p where id = m_tour;                                                       -- a login linked to the person
  insert into public.pending_invites (email, workspace_id, role, person_id) values ('zz-pi-' || tag || '@example.invalid', noted, 'team', id_p);

  -- ═══ 1. deleting keeps a copy for 30 days, records who deleted it, and really deletes ═══
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('invoice', id_inv, 'ZZ-1', 'ZZ Promoter');
  if tid is null then raise exception '1a: no copy was made'; end if;
  select count(*) into n from public.trash_items where id = tid and deleted_by = owner and expires_at - deleted_at = interval '30 days' and label = 'ZZ-1' and detail = 'ZZ Promoter' and files = '{}';
  if n <> 1 then raise exception '1b: the copy does not record who deleted it / 30 days / its label'; end if;
  select count(*) into n from public.invoices where id = id_inv;
  if n <> 0 then raise exception '1c: the invoice was not deleted'; end if;
  if public.trash_delete('invoice', 'zz-no-such-invoice') is not null then raise exception '1d: something that is not in the database got a copy'; end if;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '1e: %', res; end if;

  -- ═══ 2. nobody can write to the trash directly, or read what a copy holds ═══
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('deposit', id_dep, 'ZZ deposit');
  refused := false;
  begin insert into public.trash_items (id, client_id, kind, section, sections, item_id, label) values ('zz-forged', cid, 'deposit', 'finance', '{finance}', 'x', 'Forged'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2a: a copy could be written directly'; end if;
  refused := false;
  begin update public.trash_items set label = 'changed' where id = tid; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2b: a copy could be edited directly'; end if;
  refused := false;
  begin delete from public.trash_items where id = tid; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2c: a copy could be deleted directly'; end if;
  refused := false;
  begin perform count(*) from public.trash_contents; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2d: what a copy holds could be read'; end if;
  refused := false;
  begin insert into public.trash_contents (trash_id, bundle) values (tid, '{}'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2e: what a copy holds could be written'; end if;
  refused := false;
  begin perform public.trash_take('deposit', id_dep, 'x', 'y'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '2f: the inner copy step could be called directly'; end if;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '2g: %', res; end if;

  -- ═══ 3. who can delete and who can see ═══
  -- a finance-only editor can delete an invoice (the copy is kept), but not a show (no Tour edit), and nothing of another artist's
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('invoice', id_inv, 'ZZ-1');
  refused := false;
  begin perform public.trash_delete('show', id_show, 'A show'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '3a: a finance editor could delete a show'; end if;
  refused := false;
  begin perform public.trash_delete('invoice', id_inv2, 'Other artist'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '3b: someone could delete another artist''s invoice'; end if;
  -- ...but cannot see the copy (an invoice copy includes fee-link data from Deals & fees), nor put it back, nor throw it away
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '3c: someone without access to every part of the copy could see it'; end if;
  refused := false;
  begin perform public.trash_restore(tid); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '3d: someone who cannot see a copy could restore it'; end if;
  refused := false;
  begin perform public.trash_discard(tid); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '3e: someone who cannot see a copy could throw it away'; end if;
  reset role;
  select count(*) into n from public.invoices where id = id_inv2;
  if n <> 1 then raise exception '3f: the other artist''s invoice should still be there'; end if;
  select count(*) into n from public.shows where id = id_show;
  if n <> 1 then raise exception '3g: the show should still be there'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '3h: %', res; end if;

  -- a Tour-only editor can delete a show but not see its copy (it carries fee terms and bills)
  perform set_config('request.jwt.claims', json_build_object('sub', u_tour, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show, 'ZZ Venue');
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '3i: a Tour-only editor could see a show copy'; end if;
  refused := false;
  begin perform public.trash_discard(tid); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception '3j: someone who cannot see a copy could throw it away'; end if;
  reset role;
  -- a teammate with every part can see it, and so can the owner
  perform set_config('request.jwt.claims', json_build_object('sub', u_all, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '3k: a teammate with every part could not see the copy'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '3l: the owner could not see the copy'; end if;
  reset role;
  -- ...and the teammate with every part can put it back (not only the owner)
  perform set_config('request.jwt.claims', json_build_object('sub', u_all, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '3m: %', res; end if;
  -- ...and throw away a copy for good
  perform set_config('request.jwt.claims', json_build_object('sub', u_all, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('deposit', id_dep, 'ZZ deposit');
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '3n: the teammate could not see their own deposit copy'; end if;
  got := public.trash_discard(tid);
  reset role;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '3o: the teammate could not delete a copy for good'; end if;
  insert into public.deposits (id, client_id, name, date, amount, invoice_id) values (id_dep, cid, 'ZZ deposit', current_date, 7500, id_inv);   -- (put the test deposit back)

  -- a Point Person (admin for this artist) can do all of it
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show, 'ZZ Venue');
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '3p: a Point Person could not see a show copy'; end if;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '3q: %', res; end if;
  -- an artist's own login can do none of it
  perform set_config('request.jwt.claims', json_build_object('sub', u_art, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.trash_delete('deposit', id_dep, 'x'); exception when insufficient_privilege then refused := true; end;
  reset role;
  if not refused then raise exception '3r: an artist''s own login could delete a deposit'; end if;
  select count(*) into n from public.deposits where id = id_dep;
  if n <> 1 then raise exception '3s: the deposit should still be there'; end if;

  -- ═══ 4. an item hidden from someone stays hidden in the trash, and the hiding comes back with it ═══
  insert into public.item_access (id, client_id, item_type, item_id, member_id, effect) values ('zz-ia-' || tag, cid, 'invoice', id_inv, m_all, 'hide');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('invoice', id_inv, 'ZZ-1');                           -- the database also removes the hiding rule now
  reset role;
  select count(*) into n from public.item_access where item_id = id_inv;
  if n <> 0 then raise exception '4a: the test needs the hiding rule to be removed by the delete (it was not)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_all, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '4b: an invoice hidden from this person showed in the trash'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '4c: the owner could not see the hidden invoice''s copy'; end if;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '4d: not restored: %', res; end if;
  select count(*) into n from public.item_access where item_type = 'invoice' and item_id = id_inv and member_id = m_all and effect = 'hide';
  if n <> 1 then raise exception '4e: the hiding rule did not come back with the invoice'; end if;
  select count(*) into n from public.deposits where id = id_dep and invoice_id = id_inv;
  if n <> 1 then raise exception '4f: the deposit was not linked back to the invoice'; end if;
  delete from public.item_access where id like 'zz-ia-%' or (item_id = id_inv);

  -- ═══ 5. a round trip for every kind: delete, put it back; every table in the database ends up exactly as it was ═══
  spec := public.trash_spec() -> 'kinds';
  for k, s in select * from (values ('show', id_show), ('offer', id_offer), ('invoice', id_inv), ('bill', id_exp), ('deposit', id_dep), ('person', id_p)) v(k, s) loop
    h0 := public.zz_fp();
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
    set local role authenticated;
    tid := public.trash_delete(k, s, 'ZZ ' || k);
    reset role;
    execute format('select count(*) from public.%I where id = $1', spec -> k ->> 'rootTable') into n using s;
    if n <> 0 then raise exception '5f %: it was not deleted', k; end if;
    if k = 'bill' then
      select files into got from public.trash_items where id = tid;
      if got is distinct from array[cid || '/zz-' || tag || '.pdf'] then raise exception '5g bill: its PDF is not kept with the copy: %', got; end if;
    end if;
    h1 := public.zz_fp();
    select coalesce(array_agg(x order by x), '{}') into changed from jsonb_object_keys(h0) x where h0 -> x is distinct from h1 -> x;
    select array(select distinct t from (select spec -> k ->> 'rootTable' t union all select c ->> 'table' from jsonb_array_elements(spec -> k -> 'children') c
                  union all select r ->> 'table' from jsonb_array_elements(spec -> k -> 'relinks') r) q) into expected;
    if exists (select 1 from unnest(changed) c where c <> all(expected)) then raise exception '5a %: the delete changed tables the copy does not know about: %', k, changed; end if;
    if cardinality(changed) = 0 then raise exception '5b %: the delete changed nothing (test data missing?)', k; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
    set local role authenticated;
    res := public.trash_restore(tid);
    reset role;
    if res ->> 'status' <> 'restored' or jsonb_array_length(res -> 'notes') > 0 then raise exception '5c %: %', k, res; end if;
    if public.zz_fp() is distinct from h0 then
      select coalesce(array_agg(x order by x), '{}') into changed from jsonb_object_keys(h0) x where h0 -> x is distinct from public.zz_fp() -> x;
      raise exception '5d %: after putting it back these tables differ from before: %', k, changed;
    end if;
    select count(*) into n from public.trash_items where id = tid;
    if n <> 0 then raise exception '5e %: the copy was not removed after restoring', k; end if;
  end loop;

  -- "delete for good" removes the copy and hands back the stored file to remove
  insert into public.expenses (id, client_id, description, vendor, amount, category, date, bill_file_path) values (id_exp2, cid, 'Fuel', 'ZZ Fuel', 50, 'travel', current_date, cid || '/zz2-' || tag || '.pdf');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('bill', id_exp2, 'ZZ Fuel');
  got := public.trash_discard(tid);
  reset role;
  if got is distinct from array[cid || '/zz2-' || tag || '.pdf'] then raise exception '5h: delete for good did not hand back the file: %', got; end if;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '5i: delete for good left the copy'; end if;
  select count(*) into n from public.trash_contents where trash_id = tid;
  if n <> 0 then raise exception '5j: delete for good left what the copy held'; end if;

  -- a stored file is kept with the copy only if it is a PDF in this artist's own folder (the bill's column can hold any text)
  insert into public.expenses (id, client_id, description, vendor, amount, category, date, bill_file_path) values (id_exp3, cid, 'Odd', 'ZZ Odd', 5, 'travel', current_date, 'someone-else/zz3-' || tag || '.pdf');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('bill', id_exp3, 'ZZ Odd');
  reset role;
  select files into got from public.trash_items where id = tid;
  if got is distinct from '{}'::text[] then raise exception '5k: another artist''s folder was kept as this copy''s file: %', got; end if;
  delete from public.trash_items where id = tid;

  -- ═══ 6. things that changed while it was in the trash ═══
  delete from public.budgets where id = id_bud4;                       -- (the show's budget that came from the offer is not part of this one)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show, 'ZZ Venue');
  reset role;
  delete from public.tour_offers where id = id_offer;                   -- its offer is gone
  delete from public.travel_items where id = id_ti;                     -- a booking is gone
  delete from public.settlements where id = id_set;                     -- the settlement is gone
  delete from public.invoices where id = id_inv;                        -- the deal's invoice is gone
  delete from public.expenses where id = id_exp;                        -- a bill is gone
  delete from public.budgets where id = id_bud2;                        -- one of the two budgets is gone
  delete from public.runs where id = id_run;                            -- the run an older booking pointed at is gone
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '6a: %', res; end if;
  select count(*) into n from public.shows where id = id_show and tour_offer_id is null;
  if n <> 1 then raise exception '6b: the show did not come back without its dead offer link'; end if;
  select count(*) into n from public.show_deals where show_id = id_show and guarantee = 15000 and invoice_id is null;
  if n <> 1 then raise exception '6c: the fee did not come back (without the dead invoice link)'; end if;
  select count(*) into n from public.show_advances where show_id = id_show;
  if n <> 1 then raise exception '6d: the advance did not come back'; end if;
  select count(*) into n from public.advance_contacts where advance_id = 'zz-adv-' || tag;
  if n <> 1 then raise exception '6e: the advance contact did not come back'; end if;
  select count(*) into n from public.guest_list_entries where show_id = id_show;
  if n <> 1 then raise exception '6f: the guest did not come back'; end if;
  select count(*) into n from public.travel_item_shows where show_id = id_show;
  if n <> 0 then raise exception '6g: a link to a deleted booking came back'; end if;
  select count(*) into n from public.settlement_shows where show_id = id_show;
  if n <> 0 then raise exception '6h: a link to a deleted settlement came back'; end if;
  select count(*) into n from public.budgets where id = id_bud and show_id = id_show;
  if n <> 1 then raise exception '6i: the surviving budget was not linked back to the show'; end if;
  select count(*) into n from public.travel_items where id = id_ti2 and show_id = id_show and run_id is null;
  if n <> 1 then raise exception '6j: the older booking did not come back without its dead run link'; end if;
  select count(*) into n from public.flight_legs where travel_item_id = id_ti2;
  if n <> 1 then raise exception '6k: the flight leg did not come back'; end if;
  if not (res -> 'notes') @> '["The link to the offer was dropped because that offer has been deleted.", "The link to the invoice was dropped because that invoice has been deleted.", "The link to the run was dropped because that run has been deleted.", "A booking link was left out because the booking it belongs to has been deleted.", "A settlement link was left out because the settlement it belongs to has been deleted.", "A bill link was left out because the bill it belongs to has been deleted.", "1 budget that used to be linked to it was not linked back, because it has since been deleted or linked to something else.", "1 offer that used to be linked to it was not linked back, because it has since been deleted or linked to something else."]'::jsonb
  then raise exception '6l: the notes are not what a person should be told: %', res -> 'notes'; end if;
  if jsonb_array_length(res -> 'notes') <> 8 then raise exception '6m: expected exactly 8 notes: %', res -> 'notes'; end if;

  -- restoring something that is already there changes nothing and just clears the copy
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid2 := public.trash_delete('show', id_show, 'ZZ Venue');
  reset role;
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show, cid, current_date + 40, 'London, UK', 'Made again', '21:00');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid2);
  reset role;
  if res ->> 'status' <> 'already' then raise exception '6n: %', res; end if;
  select count(*) into n from public.trash_items where id = tid2;
  if n <> 0 then raise exception '6o: the copy of something already there stayed in the trash'; end if;
  select count(*) into n from public.shows where id = id_show and venue = 'Made again';
  if n <> 1 then raise exception '6p: something that was already there was overwritten'; end if;
  delete from public.shows where id = id_show;

  -- a person whose email someone else has taken since comes back without it (one email per artist)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('person', id_p, 'ZZ Person');
  reset role;
  insert into public.people (id, client_id, name, email) values ('zz-p2-' || tag, cid, 'Someone Else', 'ZZ-' || tag || '@example.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  select count(*) into n from public.people where id = id_p and email is null and name = 'ZZ Person';
  if n <> 1 then raise exception '6q: the person did not come back without the taken email'; end if;
  if not (res -> 'notes') @> to_jsonb(array['Someone Else already has the email zz-' || tag || '@example.invalid, so ZZ Person came back without it.']) then raise exception '6r: %', res -> 'notes'; end if;
  select count(*) into n from public.crew_members where id = id_cm;
  if n <> 1 then raise exception '6s: the person''s crew role did not come back'; end if;
  select count(*) into n from public.release_stakeholders where person_id = id_p;
  if n <> 1 then raise exception '6t: the person''s release contact did not come back'; end if;
  select count(*) into n from public.workspace_members where id = m_tour and person_id = id_p;
  if n <> 1 then raise exception '6u: the person''s login was not linked back'; end if;
  select count(*) into n from public.pending_invites where person_id = id_p;
  if n <> 1 then raise exception '6v: the person''s invitation was not linked back'; end if;

  -- ═══ 7. what can go wrong when putting it back ═══
  -- a row that cannot go back is left out and said so; everything else does come back
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show7, cid, current_date + 50, 'Paris, FR', 'ZZ7', '20:00');
  insert into public.guest_list_entries (id, show_id, name) values ('zz-g7-' || tag, id_show7, 'G7');
  insert into public.show_advances (id, show_id) values ('zz-adv7-' || tag, id_show7);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show7, 'ZZ7');
  reset role;
  update public.trash_contents set bundle = jsonb_set(bundle, '{rows}', (select jsonb_agg(case when r ->> 'table' = 'guest_list_entries'
      then jsonb_set(r, '{rows,0,show_id}', '"zz-no-such-show"') else r end) from jsonb_array_elements(bundle -> 'rows') r)) where trash_id = tid;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' then raise exception '7a: %', res; end if;
  select count(*) into n from public.shows where id = id_show7;
  if n <> 1 then raise exception '7b: the show did not come back'; end if;
  select count(*) into n from public.show_advances where show_id = id_show7;
  if n <> 1 then raise exception '7c: the rest of the show did not come back around the row that could not'; end if;
  select count(*) into n from public.guest_list_entries where id = 'zz-g7-' || tag;
  if n <> 0 then raise exception '7d: the impossible row came back'; end if;
  if not (res -> 'notes') @> '["A guest could not be put back because something it depends on has changed, so it was left out."]'::jsonb then raise exception '7e: %', res -> 'notes'; end if;

  -- the item itself either comes back completely or not at all: if its own row cannot go back, nothing does and the copy stays
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show8, cid, current_date + 60, 'Rome, IT', 'ZZ8', '20:00');
  insert into public.guest_list_entries (id, show_id, name) values ('zz-g8-' || tag, id_show8, 'G8');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show8, 'ZZ8');
  reset role;
  update public.trash_contents set bundle = jsonb_set(bundle, '{root,client_id}', '"zz-no-such-client"') where trash_id = tid;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin res := public.trash_restore(tid); exception when others then refused := true; end;
  reset role;
  if not refused then raise exception '7f: a restore whose item cannot go back did not fail'; end if;
  select count(*) into n from public.shows where id = id_show8;
  if n <> 0 then raise exception '7g: the item was half-restored'; end if;
  select count(*) into n from public.guest_list_entries where id = 'zz-g8-' || tag;
  if n <> 0 then raise exception '7h: a part came back without its item'; end if;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 1 then raise exception '7i: the copy was lost though the restore failed'; end if;
  delete from public.trash_items where id = tid;

  -- a copy made before a column was added still comes back (the new column takes its default)
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show9, cid, current_date + 70, 'Oslo, NO', 'ZZ9', '20:00');
  insert into public.guest_list_entries (id, show_id, name) values ('zz-g9-' || tag, id_show9, 'G9');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show9, 'ZZ9');
  reset role;
  alter table public.guest_list_entries add column zz_new text not null default 'x';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'restored' or jsonb_array_length(res -> 'notes') > 0 then raise exception '7j: %', res; end if;
  select count(*) into n from public.guest_list_entries where id = 'zz-g9-' || tag and zz_new = 'x';
  if n <> 1 then raise exception '7k: the guest did not come back with the new column'; end if;
  alter table public.guest_list_entries drop column zz_new;

  -- a copy that has expired cannot be seen or put back
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('deposit', id_dep, 'ZZ deposit');
  reset role;
  update public.trash_items set deleted_at = now() - interval '31 days', expires_at = now() - interval '1 day' where id = tid;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.trash_items where id = tid;
  if n <> 0 then raise exception '7l: an expired copy could still be seen'; end if;
  res := public.trash_restore(tid);
  reset role;
  if res ->> 'status' <> 'missing' then raise exception '7m: an expired copy could be restored: %', res; end if;

  -- a show whose offer has been linked to another show since comes back without that offer (the two sides must not disagree)
  insert into public.tour_offers (id, client_id, venue, city, country, date, promoter, guarantee, status) values (id_offer10, cid, 'ZZ10', 'Lyon', 'FR', current_date + 80, 'ZZ Promoter', 1000, 'confirmed');
  insert into public.shows (id, client_id, date, city, venue, time, tour_offer_id) values (id_show10, cid, current_date + 80, 'Lyon, FR', 'ZZ10', '20:00', id_offer10);
  update public.tour_offers set show_id = id_show10 where id = id_offer10;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', id_show10, 'ZZ10');
  reset role;
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show11, cid, current_date + 81, 'Lyon, FR', 'ZZ11', '20:00');
  update public.tour_offers set show_id = id_show11 where id = id_offer10;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  select count(*) into n from public.shows where id = id_show10 and tour_offer_id is null;
  if n <> 1 then raise exception '7n: the show came back claiming an offer that belongs to another show'; end if;
  select count(*) into n from public.tour_offers where id = id_offer10 and show_id = id_show11;
  if n <> 1 then raise exception '7o: the offer was taken away from the other show'; end if;
  if not (res -> 'notes') @> '["The link to the offer was dropped because that offer now belongs to something else."]'::jsonb then raise exception '7p: %', res -> 'notes'; end if;

  -- if the database would take something with an item that the trash does not know about, deleting it is refused (the copy would be incomplete)
  create table public.zz_extra (id text primary key, show_id text references public.shows(id) on delete cascade);
  insert into public.shows (id, client_id, date, city, venue, time) values (id_show12, cid, current_date + 90, 'Bern, CH', 'ZZ12', '20:00');
  insert into public.zz_extra (id, show_id) values ('zz-extra-' || tag, id_show12);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.trash_delete('show', id_show12, 'ZZ12'); exception when others then refused := true; end;
  reset role;
  if not refused then raise exception '7q: a delete went ahead although the copy would have been incomplete'; end if;
  select count(*) into n from public.shows where id = id_show12;
  if n <> 1 then raise exception '7r: the show was deleted anyway'; end if;
  select count(*) into n from public.trash_items where item_id = id_show12;
  if n <> 0 then raise exception '7s: a copy was left for a delete that was refused'; end if;
  drop table public.zz_extra;

  -- ═══ 8. what each kind saves matches what the database really deletes and unlinks (checked against the live foreign keys) ═══
  for k in select jsonb_object_keys(spec) loop
    -- tables the database deletes along with the root, however deep
    with recursive cascade_from(tbl) as (
      select (select relname from pg_class where oid = c.conrelid) from pg_constraint c
        where c.contype = 'f' and c.confdeltype = 'c' and c.confrelid = ('public.' || (spec -> k ->> 'rootTable'))::regclass
      union
      select (select relname from pg_class where oid = c.conrelid) from pg_constraint c join cascade_from f on c.confrelid = ('public.' || f.tbl)::regclass
        where c.contype = 'f' and c.confdeltype = 'c')
    select coalesce(array_agg(distinct tbl order by tbl), '{}') into changed from cascade_from;
    select coalesce(array_agg(distinct c ->> 'table' order by c ->> 'table'), '{}') into expected from jsonb_array_elements(spec -> k -> 'children') c;
    if changed is distinct from expected then raise exception '8a %: the database deletes % with it, the copy saves %', k, changed, expected; end if;
    -- links the database clears (set null) on the root or on anything deleted with it
    select coalesce(array_agg(distinct rel || '.' || col order by rel || '.' || col), '{}') into changed from (
      select (select relname from pg_class where oid = c.conrelid) rel, (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) col
        from pg_constraint c
       where c.contype = 'f' and c.confdeltype = 'n'
         and (select relname from pg_class where oid = c.confrelid) = any (array[spec -> k ->> 'rootTable'] || (select array_agg(x ->> 'table') from jsonb_array_elements(spec -> k -> 'children') x))) q;
    select coalesce(array_agg(distinct r ->> 'table' || '.' || (r ->> 'column') order by r ->> 'table' || '.' || (r ->> 'column')), '{}') into expected
      from jsonb_array_elements(spec -> k -> 'relinks') r where not (r ? 'filter');           -- a link the APP clears (a show's budget leaves its offer) has a filter and is not a database set-null
    if changed is distinct from expected then raise exception '8b %: the database clears links %, the copy remembers %', k, changed, expected; end if;
    -- every link on the item or what goes with it that points at something OUTSIDE the copy (which can be deleted while the copy waits)
    -- must be handled when putting it back: cleared or left out, never an error
    select coalesce(array_agg(q.tbl || '.' || q.col order by q.tbl || '.' || q.col), '{}') into changed from (
      select (select relname from pg_class where oid = c.conrelid) tbl, (select attname from pg_attribute where attrelid = c.conrelid and attnum = c.conkey[1]) col,
             (select relname from pg_class where oid = c.confrelid) refs
        from pg_constraint c
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and (select relname from pg_class where oid = c.conrelid) = any (array[spec -> k ->> 'rootTable'] || (select array_agg(x ->> 'table') from jsonb_array_elements(spec -> k -> 'children') x))) q
     where q.refs <> 'clients'
       and q.refs <> all (array[spec -> k ->> 'rootTable'] || coalesce((select array_agg(x ->> 'table') from jsonb_array_elements(spec -> k -> 'children') x), '{}'))
       and not exists (select 1 from jsonb_array_elements(spec -> k -> 'rootNeeds') nd where q.tbl = spec -> k ->> 'rootTable' and nd ->> 'column' = q.col)
       and not exists (select 1 from jsonb_array_elements(spec -> k -> 'children') ch, jsonb_array_elements(coalesce(ch -> 'needs', '[]'::jsonb)) nd where ch ->> 'table' = q.tbl and nd ->> 'column' = q.col)
       and not exists (select 1 from jsonb_array_elements(spec -> k -> 'children') ch where ch ->> 'table' = q.tbl and ch -> 'filter' ->> 'column' = q.col);
    if cardinality(changed) > 0 then raise exception '8c %: these links point outside the copy and are not handled when putting it back: %', k, changed; end if;
  end loop;

  raise exception 'ALL 066 CHECKS PASSED (rolled back)';
end $test$;
