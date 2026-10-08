-- Finance Stage 3: bills (attached PDF + extracted details) and a vendor
-- directory that remembers each vendor's details and flags changes.
--
-- Bills ARE expenses (one unified list) - they just gain a due date, a bill
-- number, the attached PDF, a link to a saved vendor, and a record of which
-- vendor details differed from the saved ones when the bill was confirmed.
--
-- Eli's rule: bills/expenses/vendors are management-side only. The artist's
-- own login (workspace_members.client_id set) can currently view every
-- section of their client; is_management_side() lets these tables opt out
-- of that, while team members granted Finance access keep working.

create or replace function is_management_side(target_client_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  wm record;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
  limit 1;

  if wm is null then
    return false;
  end if;

  -- An artist login is the only kind of member tied to one client.
  return wm.client_id is null;
end;
$$;

revoke all on function is_management_side(text) from public, anon;
grant execute on function is_management_side(text) to authenticated;

-- ── Vendor directory ─────────────────────────────────────────
-- Bank details are never stored in full: last 4 digits for display, plus a
-- keyed hash (HMAC, computed server-side) so a changed account is still
-- detected without the real number sitting in the database.
create table if not exists vendors (
  id               text primary key,
  client_id        text not null references clients(id) on delete cascade,
  name             text not null,
  address          text,
  email            text,
  phone            text,
  tax_id           text,
  bank_last4       text,
  bank_fingerprint text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_vendors_client_id on vendors(client_id);
create unique index if not exists vendors_client_name_unique on vendors(client_id, lower(name));

alter table vendors enable row level security;

create policy "vendors select" on vendors for select
  using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "vendors insert" on vendors for insert
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "vendors update" on vendors for update
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id))
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "vendors delete" on vendors for delete
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- ── Expenses become bills too ────────────────────────────────
alter table expenses add column if not exists vendor_id text references vendors(id) on delete set null;
alter table expenses add column if not exists due_date date;
alter table expenses add column if not exists bill_number text;
alter table expenses add column if not exists bill_file_path text;
alter table expenses add column if not exists vendor_flags text[];

create index if not exists idx_expenses_vendor_id on expenses(vendor_id);

drop policy if exists "expenses select" on expenses;
drop policy if exists "expenses insert" on expenses;
drop policy if exists "expenses update" on expenses;
drop policy if exists "expenses delete" on expenses;
create policy "expenses select" on expenses for select
  using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "expenses insert" on expenses for insert
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "expenses update" on expenses for update
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id))
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "expenses delete" on expenses for delete
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- ── Private bucket for the attached PDFs ─────────────────────
-- No storage policies on purpose: default-deny for anon/authenticated, so
-- files are reachable only through our server routes (service role), which
-- check access first - same posture as the credential tables.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bills', 'bills', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;
