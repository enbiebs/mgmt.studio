-- "Deals & fees": booking offers and a show's money get their own permission, separate from Tour.
--
-- Why a new table: row-level security can hide rows but never columns, so anyone who could read a show could read its
-- guarantee, deposit and commissions. The money fields now live in show_deals, which only people with the Deals & fees
-- permission can read (and never an artist's own login: the artist sees what management sends them as an offer sheet).
-- A show that is hidden from someone with a per-item "hide" hides its fees from them too.
--
-- Phase 1 (this migration, additive): create show_deals and copy the money across, move tour_offers and offer_sheets
-- onto the new permission, retag their activity entries, and make new to-dos about an offer follow the permission.
-- The old money columns on `shows` are left in place so the site that is live right now keeps working until the new
-- code is deployed; phase 2 (migration 056) re-syncs, drops them and scrubs old activity entries.
--
-- Nobody silently loses anything today: everyone who has Tour for an artist gets Deals & fees for it at the same level
-- (an admin can untick it afterwards, and the ready-made roles for NEW invites follow the plan: Touring Crew never has it).

-- 1. 'deals' is a valid permission
alter table public.access_grants drop constraint if exists access_grants_section_check;
alter table public.access_grants add constraint access_grants_section_check
  check (section in ('music','tour','content','finance','team','projects','analytics','fandom','legal','profile','vault','admin','deals'));

insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit)
select 'grant-' || gen_random_uuid()::text, g.workspace_member_id, 'deals', g.client_id, g.can_edit
  from public.access_grants g
 where g.section = 'tour'
on conflict do nothing;

-- 2. The invite trigger may now set up Deals & fees too (same rules as migration 052, one more allowed page)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
  new_member_id uuid;
  inv record;
begin
  select * into inv from public.pending_invites p
   where p.email = lower(new.email) and p.used_at is null and p.created_at > now() - interval '14 days'
   order by p.created_at desc limit 1;

  if found then
    insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
    values (inv.workspace_id, new.id, inv.role, inv.person_id, inv.client_id)
    returning id into new_member_id;
    update public.pending_invites set used_at = now() where id = inv.id;

    if inv.role in ('team', 'agent', 'lawyer') and inv.client_id is null and jsonb_array_length(inv.access) > 0 then
      begin
        insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit)
        select 'grant-' || gen_random_uuid()::text, new_member_id, a.section, a.client_id, a.can_edit
          from jsonb_to_recordset(inv.access) as a(section text, client_id text, can_edit boolean)
          join public.clients c on c.id = a.client_id and c.workspace_id = inv.workspace_id and c.demo_owner is null
         where a.section in ('music', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'legal', 'profile', 'deals', 'admin')
           and a.can_edit is not null
           and (a.section <> 'admin' or a.can_edit)
         limit 300
        on conflict do nothing;
      exception when others then
        update public.pending_invites set apply_error = left(sqlerrm, 300) where id = inv.id;
      end;
    end if;
  else
    insert into public.workspaces (name)
    values (coalesce(nullif(left(new.raw_user_meta_data->>'workspace_name', 80), ''), split_part(new.email, '@', 1)))
    returning id into new_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'manager');
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. A show's money, in its own table
create table if not exists public.show_deals (
  show_id                  text primary key references public.shows(id) on delete cascade,
  id                       text generated always as (show_id) stored,   -- the activity log looks entries up by "id"
  client_id                text not null references public.clients(id) on delete cascade,
  guarantee                numeric,
  deposit                  numeric,
  currency                 text,
  via_agency               boolean,
  agency_name              text,
  agency_commission_pct    numeric,
  management_commission_pct numeric,
  invoice_id               text references public.invoices(id) on delete set null,
  updated_at               timestamptz not null default now()
);
create index if not exists show_deals_client_idx on public.show_deals (client_id);
create index if not exists show_deals_invoice_idx on public.show_deals (invoice_id) where invoice_id is not null;

-- Is this show hidden from the caller by a per-item "hide"? (Looked up directly, so it works for someone who has Deals &
-- fees but no Tour access and so cannot read the show row itself.)
create or replace function public.show_hidden_from_me(p_client text, p_show text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.item_access ia
      join public.workspace_members wm on wm.id = ia.member_id
      join public.clients c on c.workspace_id = wm.workspace_id and c.id = p_client
     where ia.item_type = 'show' and ia.item_id = p_show and ia.effect = 'hide' and wm.user_id = auth.uid()
  )
$$;
revoke all on function public.show_hidden_from_me(text, text) from public, anon;
grant execute on function public.show_hidden_from_me(text, text) to authenticated;

-- The fees always belong to the artist the show belongs to; they can't be moved to another show.
create or replace function public.show_deals_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare sc text;
begin
  select s.client_id into sc from public.shows s where s.id = new.show_id;
  if sc is null or sc <> new.client_id then raise exception 'That show is not part of this artist'; end if;
  if TG_OP = 'UPDATE' and new.show_id <> old.show_id then raise exception 'Fees cannot move to another show'; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.show_deals_guard() from public, anon, authenticated;
drop trigger if exists show_deals_guard on public.show_deals;
create trigger show_deals_guard before insert or update on public.show_deals
  for each row execute function public.show_deals_guard();

alter table public.show_deals enable row level security;
revoke all on public.show_deals from anon;
grant select, insert, update, delete on public.show_deals to authenticated;

create policy "show_deals select" on public.show_deals for select to authenticated
  using (public.has_section_access(client_id, 'deals') and public.is_management_side(client_id) and not public.show_hidden_from_me(client_id, show_id));
create policy "show_deals insert" on public.show_deals for insert to authenticated
  with check (public.has_section_access(client_id, 'deals', true) and public.is_management_side(client_id) and not public.show_hidden_from_me(client_id, show_id));
create policy "show_deals update" on public.show_deals for update to authenticated
  using (public.has_section_access(client_id, 'deals', true) and public.is_management_side(client_id) and not public.show_hidden_from_me(client_id, show_id))
  with check (public.has_section_access(client_id, 'deals', true) and public.is_management_side(client_id) and not public.show_hidden_from_me(client_id, show_id));
create policy "show_deals delete" on public.show_deals for delete to authenticated
  using (public.has_section_access(client_id, 'deals', true) and public.is_management_side(client_id) and not public.show_hidden_from_me(client_id, show_id));

-- copy today's money across (only shows that have any)
insert into public.show_deals (show_id, client_id, guarantee, deposit, currency, via_agency, agency_name, agency_commission_pct, management_commission_pct, invoice_id)
select s.id, s.client_id, s.guarantee, s.deposit, s.currency, s.via_agency, s.agency_name, s.agency_commission_pct, s.management_commission_pct, s.invoice_id
  from public.shows s
 where s.guarantee is not null or s.deposit is not null or s.via_agency is not null or s.agency_name is not null
    or s.agency_commission_pct is not null or s.management_commission_pct is not null or s.invoice_id is not null
on conflict do nothing;

-- 4. Booking offers and their sheets follow the new permission (Tour no longer opens them)
drop policy if exists "tour_offers select" on public.tour_offers;
create policy "tour_offers select" on public.tour_offers for select
  using (public.has_section_access(client_id, 'deals') and public.is_management_side(client_id));
drop policy if exists "tour_offers insert" on public.tour_offers;
create policy "tour_offers insert" on public.tour_offers for insert
  with check (public.has_section_access(client_id, 'deals', true));
drop policy if exists "tour_offers update" on public.tour_offers;
create policy "tour_offers update" on public.tour_offers for update
  using (public.has_section_access(client_id, 'deals', true))
  with check (public.has_section_access(client_id, 'deals', true));
drop policy if exists "tour_offers delete" on public.tour_offers;
create policy "tour_offers delete" on public.tour_offers for delete
  using (public.has_section_access(client_id, 'deals', true));

drop policy if exists "offer_sheets select" on public.offer_sheets;
create policy "offer_sheets select" on public.offer_sheets for select
  using (public.is_artist_of(client_id)
         or (public.has_section_access(client_id, 'deals') and public.has_section_access(client_id, 'finance') and public.is_management_side(client_id)));
drop policy if exists "offer_sheets insert" on public.offer_sheets;
create policy "offer_sheets insert" on public.offer_sheets for insert
  with check (public.has_section_access(client_id, 'deals', true) and public.has_section_access(client_id, 'finance', true) and public.is_management_side(client_id));
drop policy if exists "offer_sheets update" on public.offer_sheets;
create policy "offer_sheets update" on public.offer_sheets for update
  using (public.has_section_access(client_id, 'deals', true) and public.has_section_access(client_id, 'finance', true) and public.is_management_side(client_id))
  with check (public.has_section_access(client_id, 'deals', true) and public.has_section_access(client_id, 'finance', true) and public.is_management_side(client_id));
drop policy if exists "offer_sheets delete" on public.offer_sheets;
create policy "offer_sheets delete" on public.offer_sheets for delete
  using (public.has_section_access(client_id, 'deals', true) and public.has_section_access(client_id, 'finance', true) and public.is_management_side(client_id));

-- 5. The activity log: offers, offer sheets and show fees are filed under Deals & fees
do $$
declare def text;
begin
  def := pg_get_functiondef('public.log_activity'::regproc);
  def := replace(def,
    E'    if TG_TABLE_NAME = ''offer_sheets'' then\n',
    E'    if TG_TABLE_NAME = ''show_deals'' then\n      ttl := (select concat_ws('' · '', nullif(s.venue, ''''), nullif(s.city, '''')) from public.shows s where s.id = rec->>''show_id'');\n    end if;\n    if TG_TABLE_NAME = ''offer_sheets'' then\n');
  if position('show_deals' in def) = 0 then raise exception 'the activity log patch did not apply'; end if;
  execute def;
end $$;

drop trigger if exists activity_log_trg on public.tour_offers;
create trigger activity_log_trg after insert or delete or update on public.tour_offers
  for each row execute function public.log_activity('deals', 'offer');
drop trigger if exists activity_log_trg on public.offer_sheets;
create trigger activity_log_trg after insert or delete or update on public.offer_sheets
  for each row execute function public.log_activity('deals', 'offer_sheet');
drop trigger if exists activity_log_trg on public.show_deals;
create trigger activity_log_trg after insert or delete or update on public.show_deals
  for each row execute function public.log_activity('deals', 'show_deal');

update public.activity_log set section = 'deals' where entity_type in ('offer', 'offer_sheet') and section <> 'deals';

-- 6. To-dos about an offer are saved under Deals & fees, and so are the ones that already exist
do $$
declare def text;
begin
  def := pg_get_functiondef('public.tasks_guard'::regproc);
  def := replace(def, E'when ''show'' then ''tour'' when ''offer'' then ''tour''', E'when ''show'' then ''tour'' when ''offer'' then ''deals''');
  if position('when ''offer'' then ''deals''' in def) = 0 then raise exception 'the to-do guard patch did not apply'; end if;
  execute def;
end $$;
update public.tasks set section = 'deals' where link_type = 'offer' and section is distinct from 'deals';
