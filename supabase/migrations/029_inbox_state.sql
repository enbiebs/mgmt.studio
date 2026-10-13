-- Inbox (Finance Stage 5): what each person has marked done or snoozed.
--
-- The inbox list itself is worked out from the data on the fly (nothing about it is
-- stored); this table only remembers a person's choices. An item's key includes how
-- urgent it is, so something marked done comes back if it gets worse (a bill that was
-- "due soon" and then goes overdue is a different key).
--
-- Strictly personal: each person can read and write only their own rows.
create table if not exists inbox_state (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_key    text not null,
  state       text not null check (state in ('done', 'snoozed')),
  until       date,                       -- snoozed items reappear on this date
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table inbox_state enable row level security;

create policy "inbox_state own" on inbox_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
