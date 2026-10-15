-- Run in the Supabase SQL editor. Ends with an intentional error ("ALL INVITE CHECKS PASSED (rolled back)").
-- Plays the part of different people signing up. Nothing it makes is kept.
do $$
declare
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';    -- the real workspace the attacker is after
  cid text := 'nimino-7tohmry';
  u_attack uuid := gen_random_uuid();
  u_team uuid := gen_random_uuid();
  u_expired uuid := gen_random_uuid();
  u_used uuid := gen_random_uuid();
  u_mixed uuid := gen_random_uuid();
  u_artist uuid := gen_random_uuid();
  m record; n int;
begin
  -- 1. a sign-up that claims a role and a workspace it was never given gets nothing there
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data) values
    (u_attack, 'attacker@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     json_build_object('invite_workspace_id', ws, 'invite_role', 'manager', 'invite_client_id', cid)::jsonb);
  select count(*) into n from public.workspace_members where user_id = u_attack and workspace_id = ws;
  if n <> 0 then raise exception '1: the account got into the real workspace'; end if;
  select count(*) into n from public.workspace_members where user_id = u_attack;
  if n <> 1 then raise exception '1b: the account should have exactly its own workspace, got %', n; end if;
  select * into m from public.workspace_members where user_id = u_attack;
  if m.role <> 'manager' or m.client_id is not null then raise exception '1c: expected a plain manager of their own empty workspace'; end if;
  select count(*) into n from public.clients where workspace_id = m.workspace_id;
  if n <> 0 then raise exception '1d: their own workspace should be empty'; end if;

  -- 2. A real invitation: the role comes from the server-written row, never from what the account says
  insert into public.pending_invites (email, workspace_id, role, created_by) values ('teammate@example.invalid', ws, 'team', null);
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data) values
    (u_team, 'teammate@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     json_build_object('invite_role', 'manager')::jsonb);
  select * into m from public.workspace_members where user_id = u_team;
  if m.workspace_id <> ws or m.role <> 'team' then raise exception '2: the invited teammate should be a team member of the real workspace (got % / %)', m.workspace_id, m.role; end if;
  select count(*) into n from public.pending_invites where email = 'teammate@example.invalid' and used_at is not null;
  if n <> 1 then raise exception '2b: the invitation should be marked used'; end if;

  -- 3. an invitation older than 14 days, and one already used, do nothing
  insert into public.pending_invites (email, workspace_id, role, created_at) values ('old@example.invalid', ws, 'team', now() - interval '20 days');
  insert into auth.users (id, email, instance_id, aud, role) values (u_expired, 'old@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select count(*) into n from public.workspace_members where user_id = u_expired and workspace_id = ws;
  if n <> 0 then raise exception '3: an expired invitation was honoured'; end if;
  insert into public.pending_invites (email, workspace_id, role, used_at) values ('used@example.invalid', ws, 'team', now());
  insert into auth.users (id, email, instance_id, aud, role) values (u_used, 'used@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select count(*) into n from public.workspace_members where user_id = u_used and workspace_id = ws;
  if n <> 0 then raise exception '3b: a used invitation was honoured again'; end if;

  -- 4. capital letters in the email do not matter
  insert into public.pending_invites (email, workspace_id, role) values ('mixed@example.invalid', ws, 'agent');
  insert into auth.users (id, email, instance_id, aud, role) values (u_mixed, 'MiXeD@Example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select * into m from public.workspace_members where user_id = u_mixed;
  if m.workspace_id <> ws or m.role <> 'agent' then raise exception '4: a differently-capitalised email should still match its invitation'; end if;

  -- 5. an artist invitation carries the artist
  insert into public.pending_invites (email, workspace_id, role, client_id) values ('artist@example.invalid', ws, 'artist', cid);
  insert into auth.users (id, email, instance_id, aud, role) values (u_artist, 'artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select * into m from public.workspace_members where user_id = u_artist;
  if m.workspace_id <> ws or m.role <> 'artist' or m.client_id <> cid then raise exception '5: the artist invitation did not carry the artist'; end if;

  -- 6. an invitation must make sense (no manager invitations, and an artist invitation names the artist)
  begin insert into public.pending_invites (email, workspace_id, role) values ('x@example.invalid', ws, 'manager'); raise exception '6: a manager invitation was accepted';
  exception when check_violation then null; end;
  begin insert into public.pending_invites (email, workspace_id, role) values ('x@example.invalid', ws, 'artist'); raise exception '6b: an artist invitation with no artist was accepted';
  exception when check_violation then null; end;
  begin insert into public.pending_invites (email, workspace_id, role) values ('UPPER@example.invalid', ws, 'team'); raise exception '6c: a non-lowercase email was stored';
  exception when check_violation then null; end;

  -- 7. nobody signed in (or not) can read or write invitations, and nobody can call the trigger function
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.pending_invites limit 1; raise exception '7: a signed-in user read the invitations';
  exception when insufficient_privilege then null; end;
  begin insert into public.pending_invites (email, workspace_id, role) values ('y@example.invalid', ws, 'team'); raise exception '7b: a signed-in user wrote an invitation';
  exception when insufficient_privilege then null; end;
  begin perform public.handle_new_user(); raise exception '7c: handle_new_user is callable';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform 1 from public.pending_invites limit 1; raise exception '7d: anon read the invitations';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL INVITE CHECKS PASSED (rolled back)';
end $$;
