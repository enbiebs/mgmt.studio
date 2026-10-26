-- Tests supabase/migrations/070_contracts_usable.sql against the live database. It APPLIES the migration inside the test, then ends
-- with an intentional error, so NOTHING is kept (not the columns, not the bucket, not the test data). Success looks like:
--   ERROR: ALL 070 CHECKS PASSED (rolled back)
do $test$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  tag text := left(gen_random_uuid()::text, 6);
  cid text := 'zz-client-' || tag;
  id1 text := 'zz-contract-' || tag;
  id2 text := 'zz-contract2-' || tag;
  r record; ok boolean;
begin
  -- the file that gets applied for real, applied here
  execute $apply$
alter table contracts add column if not exists auto_renews    boolean not null default false;
alter table contracts add column if not exists renewal_months integer check (renewal_months is null or renewal_months between 1 and 120);
alter table contracts add column if not exists notice_days    integer check (notice_days is null or notice_days between 0 and 1000);
alter table contracts add column if not exists terms          jsonb   not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object');
alter table contracts add column if not exists files          jsonb   not null default '[]'::jsonb check (jsonb_typeof(files) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 20971520, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf', 'text/rtf'
])
on conflict (id) do nothing;
  $apply$;

  insert into public.clients (id, workspace_id, name) values (cid, noted, 'ZZ Test');

  -- an old-style contract row (none of the new columns) still saves, and gets the safe defaults
  insert into contracts (id, client_id, title, type, status, counterparty, created_at) values (id1, cid, 'Old style', 'other', 'draft', 'Someone', current_date);
  select auto_renews, renewal_months, notice_days, terms, files into r from contracts where id = id1;
  assert r.auto_renews = false, 'auto_renews defaults to false';
  assert r.renewal_months is null and r.notice_days is null, 'renewal length and notice default to nothing';
  assert r.terms = '{}'::jsonb and r.files = '[]'::jsonb, 'terms and files default to empty';

  -- the new fields round-trip
  insert into contracts (id, client_id, title, type, status, counterparty, created_at, auto_renews, renewal_months, notice_days, terms, files)
  values (id2, cid, 'New style', 'management', 'signed', 'Agency', current_date, true, 12, 60,
          '{"commission":"20%"}'::jsonb, '[{"id":"f1","path":"x/y.pdf","name":"y.pdf","label":"signed copy","addedAt":"2026-10-26"}]'::jsonb);
  select * into r from contracts where id = id2;
  assert r.auto_renews and r.renewal_months = 12 and r.notice_days = 60, 'new fields saved';
  assert r.terms->>'commission' = '20%', 'terms saved';
  assert r.files->0->>'path' = 'x/y.pdf', 'files saved';

  -- values that cannot be right are refused
  ok := false; begin update contracts set renewal_months = 0 where id = id2; exception when check_violation then ok := true; end; assert ok, 'renewal length 0 refused';
  ok := false; begin update contracts set renewal_months = 121 where id = id2; exception when check_violation then ok := true; end; assert ok, 'renewal length over 120 refused';
  ok := false; begin update contracts set notice_days = -1 where id = id2; exception when check_violation then ok := true; end; assert ok, 'negative notice refused';
  ok := false; begin update contracts set terms = '[]'::jsonb where id = id2; exception when check_violation then ok := true; end; assert ok, 'terms must be an object';
  ok := false; begin update contracts set files = '{}'::jsonb where id = id2; exception when check_violation then ok := true; end; assert ok, 'files must be a list';
  update contracts set notice_days = 0, renewal_months = 120 where id = id2;   -- the edges are fine

  -- the bucket exists, is private, and has the size limit and types
  select public, file_size_limit, allowed_mime_types into r from storage.buckets where id = 'contracts';
  assert found, 'contracts bucket exists';
  assert r.public = false, 'bucket is private';
  assert r.file_size_limit = 20971520, '20MB limit';
  assert r.allowed_mime_types @> array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/rtf', 'text/rtf'] and cardinality(r.allowed_mime_types) = 4, 'exactly pdf, docx and rtf are allowed';
  -- default-deny: no storage policy can reach this bucket. Every policy on storage.objects must name its own bucket, so none can cover "contracts" by accident.
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and coalesce(qual, '') not like '%bucket_id%' and coalesce(with_check, '') not like '%bucket_id%'), 'every storage policy names its bucket';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') like '%contracts%' or coalesce(with_check, '') like '%contracts%')), 'no storage policy opens the contracts bucket';

  -- an edit to a contract is recorded in the activity log (the new fields have readable names in the app)
  update contracts set notice_days = 45, auto_renews = true where id = id2;
  assert (select count(*) from activity_log where client_id = cid and entity_type = 'contract') >= 1, 'a contract edit is logged';

  raise exception 'ALL 070 CHECKS PASSED (rolled back)';
end
$test$;
