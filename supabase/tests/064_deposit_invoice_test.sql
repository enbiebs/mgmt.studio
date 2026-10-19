-- Run in the Supabase SQL editor (or as a dry run before applying 064: wrap the migration and this in one do-block).
-- Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  owner uuid; u_team uuid := gen_random_uuid(); m_team uuid := gen_random_uuid();
  inst text := '00000000-0000-0000-0000-000000000000';
  cid text; iid text := 'zz-inv-' || left(gen_random_uuid()::text, 6); did text := 'zz-dep-' || left(gen_random_uuid()::text, 6);
  d2 text := 'zz-dep-' || left(gen_random_uuid()::text, 6); n int;
begin
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into cid from public.clients where workspace_id = noted and demo_owner is null order by created_at limit 1;
  insert into public.invoices (id, client_id, number, to_name, category, status, issued_date, due_date, currency)
    values (iid, cid, 'ZZ-1', 'Promoter', 'touring', 'sent', current_date - 10, current_date + 20, 'USD');

  -- 1. the owner can say which invoice a deposit pays, change it, and clear it
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.deposits (id, client_id, name, date, amount, currency, invoice_id) values (did, cid, 'Invoice Payment', current_date, 5000, 'USD', iid);
  select count(*) into n from public.deposits where id = did and invoice_id = iid;
  if n <> 1 then raise exception '1a: the invoice link did not save'; end if;
  insert into public.deposits (id, client_id, name, date, amount, currency) values (d2, cid, 'BMI', current_date, 100, 'USD');
  select count(*) into n from public.deposits where id = d2 and invoice_id is null;
  if n <> 1 then raise exception '1b: a deposit with no invoice should have an empty link'; end if;
  update public.deposits set invoice_id = null where id = did;
  select count(*) into n from public.deposits where id = did and invoice_id is null;
  if n <> 1 then raise exception '1c: clearing the link did not work'; end if;
  update public.deposits set invoice_id = iid where id = did;
  reset role;

  -- 2. deleting the invoice keeps the deposit and clears the link
  delete from public.invoices where id = iid;
  select count(*) into n from public.deposits where id = did and invoice_id is null and amount = 5000;
  if n <> 1 then raise exception '2: deleting the invoice lost the deposit or left a dangling link'; end if;

  -- 3. someone on the team without Finance access cannot read the deposits or change them
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at)
    values (u_team, 'zz-team-' || left(u_team::text, 6) || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now());
  delete from public.workspace_members where user_id = u_team;
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values (m_team, noted, u_team, 'team', null);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('grant-zz-' || left(gen_random_uuid()::text, 6), m_team, 'tour', cid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.deposits where id in (did, d2);
  if n <> 0 then raise exception '3a: a person without Finance could read deposits'; end if;
  update public.deposits set invoice_id = null, amount = 1 where id = did;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '3b: a person without Finance could change a deposit'; end if;
  reset role;

  raise exception 'ALL 064 CHECKS PASSED (rolled back)';
end $$;
