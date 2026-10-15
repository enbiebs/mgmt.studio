-- Run in the Supabase SQL editor BEFORE applying migration 056. It runs the whole migration inside one block and ends
-- with an intentional error ("ALL PHASE 2 CHECKS PASSED (rolled back)"), so nothing it does is kept.
do $test$
declare
  n int; deals_before int; shows_before int; some_show text;
  money text[] := array['guarantee', 'deposit', 'currency', 'via_agency', 'agency_name', 'agency_commission_pct', 'management_commission_pct', 'invoice_id'];
begin
  select count(*) into deals_before from public.show_deals;
  select count(*) into shows_before from public.shows;
  select show_id into some_show from public.show_deals order by show_id limit 1;

  -- 1. the guard is quiet on today's data ...
  select count(*) into n from public.shows s join public.show_deals d on d.show_id = s.id
   where s.updated_at > d.updated_at
     and (d.guarantee is distinct from s.guarantee or d.deposit is distinct from s.deposit or d.currency is distinct from s.currency
          or d.via_agency is distinct from s.via_agency or d.agency_name is distinct from s.agency_name
          or d.agency_commission_pct is distinct from s.agency_commission_pct
          or d.management_commission_pct is distinct from s.management_commission_pct or d.invoice_id is distinct from s.invoice_id);
  if n <> 0 then raise exception 'FAIL: the guard would already stop on today''s data (% shows)', n; end if;

  -- ... and it WOULD stop on a lost old-app edit (a newer, different amount in the old columns)
  update public.shows set guarantee = 424242, updated_at = now() + interval '1 day' where id = some_show;
  begin
    execute $g$
      do $guard$
      declare n int;
      begin
        select count(*) into n
          from public.shows s join public.show_deals d on d.show_id = s.id
         where s.updated_at > d.updated_at
           and (d.guarantee is distinct from s.guarantee or d.deposit is distinct from s.deposit or d.currency is distinct from s.currency
                or d.via_agency is distinct from s.via_agency or d.agency_name is distinct from s.agency_name
                or d.agency_commission_pct is distinct from s.agency_commission_pct
                or d.management_commission_pct is distinct from s.management_commission_pct or d.invoice_id is distinct from s.invoice_id);
        if n > 0 then raise exception 'phase 2 stopped'; end if;
      end $guard$
    $g$;
    raise exception 'FAIL: the guard did not stop on a lost edit';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.shows set guarantee = null, updated_at = now() - interval '1 day' where id = some_show;   -- put it back

  -- 2. the migration itself (steps 1, 3 and 4; step 2 is the guard above)
  insert into public.show_deals (show_id, client_id, guarantee, deposit, currency, via_agency, agency_name, agency_commission_pct, management_commission_pct, invoice_id)
  select s.id, s.client_id, s.guarantee, s.deposit, s.currency, s.via_agency, s.agency_name, s.agency_commission_pct, s.management_commission_pct, s.invoice_id
    from public.shows s
   where s.guarantee is not null or s.deposit is not null or s.via_agency is not null or s.agency_name is not null
      or s.agency_commission_pct is not null or s.management_commission_pct is not null or s.invoice_id is not null
  on conflict (show_id) do nothing;

  alter table public.shows
    drop column if exists guarantee, drop column if exists deposit, drop column if exists currency, drop column if exists via_agency,
    drop column if exists agency_name, drop column if exists agency_commission_pct, drop column if exists management_commission_pct, drop column if exists invoice_id;

  update public.activity_log
     set changes = changes - 'guarantee' - 'deposit' - 'currency' - 'via_agency' - 'agency_name'
                            - 'agency_commission_pct' - 'management_commission_pct' - 'invoice_id'
   where entity_type = 'show' and changes ?| money;

  -- 3. the columns are gone, nothing was lost, the old index and key went with them
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'shows' and column_name = any(money);
  if n <> 0 then raise exception 'FAIL: % old money columns are still on shows', n; end if;
  if (select count(*) from public.shows) <> shows_before then raise exception 'FAIL: shows changed'; end if;
  if (select count(*) from public.show_deals) < deals_before then raise exception 'FAIL: show_deals lost rows'; end if;
  select count(*) into n from pg_indexes where schemaname = 'public' and tablename = 'shows' and indexname = 'shows_invoice_id_idx';
  if n <> 0 then raise exception 'FAIL: the old invoice index is still there'; end if;
  select count(*) into n from pg_constraint where conrelid = 'public.shows'::regclass and conname = 'shows_invoice_id_fkey';
  if n <> 0 then raise exception 'FAIL: the old invoice key is still there'; end if;

  -- 4. old Activity entries about a show no longer carry any amount
  select count(*) into n from public.activity_log where entity_type = 'show' and changes ?| money;
  if n <> 0 then raise exception 'FAIL: % show activity entries still list a fee', n; end if;

  -- 5. the app's normal writes still work without the columns: a show can be edited (and its Activity entry written) and removed with its fees
  update public.shows set notes = coalesce(notes, '') || ' ' where id = some_show;
  update public.show_deals set guarantee = 111 where show_id = some_show;
  select count(*) into n from public.activity_log where entity_type = 'show_deal' and entity_id = some_show and created_at > now() - interval '1 minute';
  if n < 1 then raise exception 'FAIL: a fee change was not written to the Activity log'; end if;
  delete from public.shows where id = some_show;
  select count(*) into n from public.show_deals where show_id = some_show;
  if n <> 0 then raise exception 'FAIL: removing a show left its fees behind'; end if;

  raise exception 'ALL PHASE 2 CHECKS PASSED (rolled back)';
end $test$;
