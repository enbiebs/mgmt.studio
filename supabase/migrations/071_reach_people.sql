-- The app starts to reach people by email. Everything here is ADDITIVE and does nothing until email is switched on in the server's
-- settings: three small new tables and one new column with a safe default.
--
--   email_log          one row for every email already sent ("morning:<login>:<company>:<day>", "contract:<id>:<date>:<milestone>:<address>",
--                      "todo:<login>:<to-do>"), so a second run on the same day, or a retry, can never send the same email twice. It also
--                      lets the server cap how many emails one outside address gets in a week. Only our server writes or reads it:
--                      row-level security is on and there is deliberately NO policy, and signed-in people are given no privileges at all.
--   email_suppressions addresses that used the "Stop these emails" link in a reminder sent to someone outside the company. Never emailed
--                      again. Server only, same posture as email_log.
--   email_prefs        each person's own switch for the morning email. No row means "on". A person can read and change only their own row.
--   contracts.reminder_emails  outside people (a lawyer, an assistant) who should get an email as a contract's key dates come up.
--                      Up to five addresses; they are checked again when an email is sent, and every email says why they got it.
create table if not exists email_log (
  key       text primary key check (char_length(key) <= 400),
  kind      text not null check (kind in ('morning', 'contract', 'todo')),
  recipient text,
  sent_at   timestamptz not null default now()
);
create index if not exists email_log_recipient_idx on email_log (recipient, sent_at) where recipient is not null;
create index if not exists email_log_sent_idx on email_log (sent_at);
alter table email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
grant select, insert, delete on public.email_log to service_role;

create table if not exists email_suppressions (
  address    text primary key check (char_length(address) <= 254 and address = lower(address)),
  created_at timestamptz not null default now()
);
alter table email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;
grant select, insert, update on public.email_suppressions to service_role;

create table if not exists email_prefs (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  morning_email boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table email_prefs enable row level security;
revoke all on public.email_prefs from anon;
grant select, insert, update, delete on public.email_prefs to authenticated;
grant select on public.email_prefs to service_role;

drop policy if exists "email_prefs own" on email_prefs;
create policy "email_prefs own" on email_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table contracts add column if not exists reminder_emails text[] not null default '{}' check (cardinality(reminder_emails) <= 5);
