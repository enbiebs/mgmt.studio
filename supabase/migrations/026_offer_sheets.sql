-- Offer sheets (Finance Stage 4, Part 2).
--
-- An offer sheet is what the manager sends the artist for one offer: the deal
-- terms plus either the full budget breakdown or a summary. It is a SNAPSHOT
-- taken at send time, so later edits to the offer or budget never change what the
-- artist saw; sending again makes the next version (V2, V3 ...) and replaces the
-- earlier one. The artist taps Approve or Pass - nothing confirms by itself, the
-- manager still confirms the offer.
--
-- Who sees what:
--   * The artist's own login can read the sheets sent to it (and nothing else
--     about offers or budgets), and answer through respond_to_offer_sheet().
--   * Management side needs both Tour and Finance access (the snapshot carries
--     budget numbers, which are Finance-only everywhere else).
-- The snapshot itself only contains what the chosen detail level allows, because
-- row-level security can't hide parts of a JSON column.

create table if not exists offer_sheets (
  id             text primary key,
  client_id      text not null references clients(id) on delete cascade,
  offer_id       text not null references tour_offers(id) on delete cascade,
  version        int  not null,
  status         text not null default 'sent'
                   check (status in ('sent', 'approved', 'passed', 'superseded', 'withdrawn')),
  detail         text not null default 'full' check (detail in ('full', 'summary')),
  message        text,
  snapshot       jsonb not null,
  sent_at        timestamptz not null default now(),
  responded_at   timestamptz,
  response_note  text,
  unique (offer_id, version)
);
create index if not exists offer_sheets_client_idx on offer_sheets(client_id);

alter table offer_sheets enable row level security;

-- True when the signed-in user is the artist login for this client.
create or replace function public.is_artist_of(target_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.user_id = auth.uid() and wm.client_id = target_client_id
  )
$$;

create policy "offer_sheets select" on offer_sheets for select using (
  public.is_artist_of(client_id)
  or (public.has_section_access(client_id, 'tour') and public.has_section_access(client_id, 'finance')
      and public.is_management_side(client_id))
);
create policy "offer_sheets insert" on offer_sheets for insert with check (
  public.has_section_access(client_id, 'tour', true) and public.has_section_access(client_id, 'finance', true)
  and public.is_management_side(client_id)
);
create policy "offer_sheets update" on offer_sheets for update using (
  public.has_section_access(client_id, 'tour', true) and public.has_section_access(client_id, 'finance', true)
  and public.is_management_side(client_id)
) with check (
  public.has_section_access(client_id, 'tour', true) and public.has_section_access(client_id, 'finance', true)
  and public.is_management_side(client_id)
);
create policy "offer_sheets delete" on offer_sheets for delete using (
  public.has_section_access(client_id, 'tour', true) and public.has_section_access(client_id, 'finance', true)
  and public.is_management_side(client_id)
);

-- The artist's only way to write: answer a sheet that is still waiting.
create or replace function public.respond_to_offer_sheet(p_sheet_id text, p_response text, p_note text default null)
returns public.offer_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.offer_sheets;
begin
  if p_response not in ('approved', 'passed') then
    raise exception 'Response must be approved or passed';
  end if;
  select * into s from public.offer_sheets where id = p_sheet_id;
  if s.id is null or not public.is_artist_of(s.client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if s.status <> 'sent' then
    raise exception 'This offer sheet was already answered or has been replaced by a newer version';
  end if;
  update public.offer_sheets
    set status = p_response, responded_at = now(), response_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_sheet_id
    returning * into s;
  return s;
end;
$$;
revoke all on function public.respond_to_offer_sheet(text, text, text) from public, anon;
grant execute on function public.respond_to_offer_sheet(text, text, text) to authenticated;

-- Offers are deal negotiations. The artist's login used to be able to read every
-- one of them (the app just never showed them); from now on the artist only
-- learns about an offer through a sheet that was sent to them.
alter policy "tour_offers select" on public.tour_offers
  using (public.has_section_access(client_id, 'tour') and public.is_management_side(client_id));
