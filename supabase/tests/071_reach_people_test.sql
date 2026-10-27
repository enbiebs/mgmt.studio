-- Tests supabase/migrations/071_reach_people.sql against the live database. It APPLIES the migration inside the test (and applies it a second
-- time, to prove it can be re-run), then ends with an intentional error, so NOTHING is kept (not the tables, not the column, not the test
-- data). Generated from the migration file, so the two cannot drift. Success looks like:
--   ERROR: ALL 071 CHECKS PASSED (rolled back)
do $test$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  tag text := left(gen_random_uuid()::text, 6);
  cid text := 'zz-client-' || tag;
  id1 text := 'zz-contract-' || tag;
  r record; ok boolean; n int;
begin
  -- the file that gets applied for real, applied here
  execute $apply$
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
  $apply$;

  insert into public.clients (id, workspace_id, name) values (cid, noted, 'ZZ Test');

  -- an old-style contract (no reminder list) still saves and gets the safe default
  insert into contracts (id, client_id, title, type, status, counterparty, created_at) values (id1, cid, 'Old style', 'other', 'draft', 'Someone', current_date);
  select reminder_emails into r from contracts where id = id1;
  assert r.reminder_emails = '{}'::text[], 'reminder list defaults to empty';

  -- addresses round-trip, up to five; six are refused
  update contracts set reminder_emails = array['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com'] where id = id1;
  assert (select cardinality(reminder_emails) from contracts where id = id1) = 5, 'five addresses saved';
  ok := false; begin update contracts set reminder_emails = array['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com','f@x.com'] where id = id1; exception when check_violation then ok := true; end;
  assert ok, 'six addresses refused';

  -- email_log: a key can be recorded once (this is what stops a double send); only the known kinds; keys are bounded
  insert into email_log (key, kind, recipient) values ('morning:u1:w1:2026-10-26', 'morning', null);
  insert into email_log (key, kind, recipient) values ('contract:k1:2026-12-01:90:a@x.com', 'contract', 'a@x.com');
  insert into email_log (key, kind, recipient) values ('todo:u1:t1', 'todo', null);
  ok := false; begin insert into email_log (key, kind) values ('morning:u1:w1:2026-10-26', 'morning'); exception when unique_violation then ok := true; end;
  assert ok, 'the same email cannot be recorded twice';
  ok := false; begin insert into email_log (key, kind) values ('x', 'spam'); exception when check_violation then ok := true; end;
  assert ok, 'an unknown kind is refused';
  ok := false; begin insert into email_log (key, kind) values (repeat('k', 401), 'morning'); exception when check_violation then ok := true; end;
  assert ok, 'an absurdly long key is refused';

  -- email_suppressions: lower-case addresses only, one row each
  insert into email_suppressions (address) values ('a@x.com');
  ok := false; begin insert into email_suppressions (address) values ('A@x.com'); exception when check_violation then ok := true; end;
  assert ok, 'an upper-case address is refused (they are always stored lower case)';
  ok := false; begin insert into email_suppressions (address) values ('a@x.com'); exception when unique_violation then ok := true; end;
  assert ok, 'one row per address';

  -- all three tables are locked: row security on; email_log and email_suppressions have no policy and no privileges for anyone signed in
  assert (select relrowsecurity from pg_class where oid = 'public.email_log'::regclass), 'email_log has row security on';
  assert (select relrowsecurity from pg_class where oid = 'public.email_suppressions'::regclass), 'email_suppressions has row security on';
  assert (select relrowsecurity from pg_class where oid = 'public.email_prefs'::regclass), 'email_prefs has row security on';
  select count(*) into n from pg_policies where schemaname = 'public' and tablename in ('email_log', 'email_suppressions');
  assert n = 0, 'email_log and email_suppressions have no policy';
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'email_prefs';
  assert n = 1, 'email_prefs has exactly one policy';
  assert (select qual from pg_policies where schemaname = 'public' and tablename = 'email_prefs') like '%auth.uid()%', 'the policy ties rows to the signed-in person';
  assert (select roles from pg_policies where schemaname = 'public' and tablename = 'email_prefs') = '{authenticated}', 'the policy is for signed-in people only';
  assert not has_table_privilege('anon', 'public.email_log', 'select') and not has_table_privilege('anon', 'public.email_log', 'insert'), 'anon has no access to email_log';
  assert not has_table_privilege('authenticated', 'public.email_log', 'select') and not has_table_privilege('authenticated', 'public.email_log', 'insert'), 'signed-in people have no access to email_log';
  assert not has_table_privilege('anon', 'public.email_suppressions', 'select') and not has_table_privilege('authenticated', 'public.email_suppressions', 'select'), 'nobody outside the server reads email_suppressions';
  assert not has_table_privilege('anon', 'public.email_prefs', 'select'), 'anon has no access to email_prefs';
  assert has_table_privilege('service_role', 'public.email_log', 'insert') and has_table_privilege('service_role', 'public.email_log', 'delete'), 'the server can record and tidy the log';
  assert has_table_privilege('service_role', 'public.email_suppressions', 'insert') and has_table_privilege('service_role', 'public.email_suppressions', 'update'), 'the server can record a stop request';
  assert has_table_privilege('service_role', 'public.email_prefs', 'select'), 'the server can read who switched the morning email off';

  -- a signed-in person (a made-up one) sees nothing of the server tables and only their own switch
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'zz-a-' || tag || '@example.com'), ('00000000-0000-0000-0000-0000000000a2', 'zz-b-' || tag || '@example.com');
  insert into email_prefs (user_id, morning_email) values ('00000000-0000-0000-0000-0000000000a1', false), ('00000000-0000-0000-0000-0000000000a2', true);
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  select count(*) into n from email_prefs;
  assert n = 1, 'a person sees only their own switch';
  assert (select morning_email from email_prefs limit 1) = false, 'and it is theirs';
  ok := false; begin perform count(*) from email_log; exception when insufficient_privilege then ok := true; end;
  assert ok, 'a signed-in person cannot read email_log';
  ok := false; begin perform count(*) from email_suppressions; exception when insufficient_privilege then ok := true; end;
  assert ok, 'a signed-in person cannot read email_suppressions';
  ok := false; begin insert into email_prefs (user_id, morning_email) values ('00000000-0000-0000-0000-0000000000a2', false); exception when others then ok := true; end;
  assert ok, 'a person cannot write someone else''s switch';
  update email_prefs set morning_email = true where user_id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 0, 'updating someone else''s row changes nothing';
  update email_prefs set morning_email = true where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'a person can change their own switch';
  reset role;
  assert (select morning_email from email_prefs where user_id = '00000000-0000-0000-0000-0000000000a2') = true, 'the other row is untouched';

  -- applying the migration a second time changes nothing and does not fail
  execute $again$ create table if not exists email_log (
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

alter table contracts add column if not exists reminder_emails text[] not null default '{}' check (cardinality(reminder_emails) <= 5); $again$;

  raise exception 'ALL 071 CHECKS PASSED (rolled back)';
end
$test$;
