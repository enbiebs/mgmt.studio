-- "Deals & fees", phase 2: a show's money now lives ONLY in show_deals (migration 055), and the app that reads and writes
-- it is deployed. This removes the old copies from `shows` (where anyone with Tour access could read them) and takes the
-- old fee amounts out of past Activity entries.
--
-- Nothing is lost: any show that still has money in the old columns but no row in show_deals gets one first, and the
-- migration refuses to run if a show's old columns look NEWER than its show_deals row with different amounts (an edit
-- made by the old app between migration 055 and the deploy), so that case is looked at by a person instead.

-- 1. Keep anything only the old columns hold
insert into public.show_deals (show_id, client_id, guarantee, deposit, currency, via_agency, agency_name, agency_commission_pct, management_commission_pct, invoice_id)
select s.id, s.client_id, s.guarantee, s.deposit, s.currency, s.via_agency, s.agency_name, s.agency_commission_pct, s.management_commission_pct, s.invoice_id
  from public.shows s
 where s.guarantee is not null or s.deposit is not null or s.via_agency is not null or s.agency_name is not null
    or s.agency_commission_pct is not null or s.management_commission_pct is not null or s.invoice_id is not null
on conflict (show_id) do nothing;

-- 2. Refuse to go on if an old-app edit would be lost
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
  if n > 0 then
    raise exception 'phase 2 stopped: % show(s) have newer, different money in the old columns than in show_deals - look at them first', n;
  end if;
end $guard$;

-- 3. Remove the old columns (their index and foreign key go with them)
alter table public.shows
  drop column if exists guarantee,
  drop column if exists deposit,
  drop column if exists currency,
  drop column if exists via_agency,
  drop column if exists agency_name,
  drop column if exists agency_commission_pct,
  drop column if exists management_commission_pct,
  drop column if exists invoice_id;

-- 4. Old Activity entries about a show listed the amounts that changed: take those out, keep the entries
update public.activity_log
   set changes = changes - 'guarantee' - 'deposit' - 'currency' - 'via_agency' - 'agency_name'
                          - 'agency_commission_pct' - 'management_commission_pct' - 'invoice_id'
 where entity_type = 'show'
   and changes ?| array['guarantee', 'deposit', 'currency', 'via_agency', 'agency_name', 'agency_commission_pct', 'management_commission_pct', 'invoice_id'];
