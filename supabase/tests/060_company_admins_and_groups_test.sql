-- Run in the Supabase SQL editor (or as a dry run before applying 060). Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  owner uuid; m_owner uuid;
  u_staff uuid := gen_random_uuid(); u_new uuid := gen_random_uuid(); u_team uuid := gen_random_uuid(); u_art uuid := gen_random_uuid(); u_out uuid := gen_random_uuid();
  m_staff uuid; m_new uuid; m_team uuid; m_art uuid; m_out uuid; out_ws uuid; g uuid; g_out uuid; n int; msg text;
  inst text := '00000000-0000-0000-0000-000000000000';
begin
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into m_owner from public.workspace_members where workspace_id = noted and user_id = owner and client_id is null;
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at) values
    (u_staff, 'zz-staff-' || left(u_staff::text, 6) || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_new,   'zz-new-'   || left(u_new::text, 6)   || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', null),
    (u_team,  'zz-team-'  || left(u_team::text, 6)  || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_art,   'zz-art-'   || left(u_art::text, 6)   || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now()),
    (u_out,   'zz-out-'   || left(u_out::text, 6)   || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now());
  select id, workspace_id into m_out, out_ws from public.workspace_members where user_id = u_out;   -- the outsider keeps the company the sign-up trigger gave them
  delete from public.workspace_members where user_id in (u_staff, u_new, u_team, u_art);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), noted, u_staff, 'team', null), (gen_random_uuid(), noted, u_new, 'team', null), (gen_random_uuid(), noted, u_team, 'team', null),
    (gen_random_uuid(), noted, u_art, 'artist', 'nimino-7tohmry');
  select id into m_staff from public.workspace_members where user_id = u_staff;
  select id into m_new from public.workspace_members where user_id = u_new;
  select id into m_team from public.workspace_members where user_id = u_team;
  select id into m_art from public.workspace_members where user_id = u_art;

  -- 1. the owner makes someone who has signed in an admin
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_company_admin(m_staff, true);
  reset role;
  if (select role from public.workspace_members where id = m_staff) <> 'manager' then raise exception '1a: the owner could not make an admin'; end if;
  set local role authenticated;
  perform public.set_company_admin(m_staff, true);   -- doing it twice is harmless
  reset role;

  -- 2. refusals for the owner: never signed in, an artist login, the owner themself
  set local role authenticated;
  begin perform public.set_company_admin(m_new, true); raise exception '2a: someone who never signed in was made an admin';
  exception when others then if sqlerrm not like '%sign in%' then raise; end if; end;
  begin perform public.set_company_admin(m_art, true); raise exception '2b: a client-bound login was made an admin';
  exception when others then if sqlerrm not like '%artist%' then raise; end if; end;
  begin perform public.set_company_admin(m_owner, false); raise exception '2c: the owner was demoted';
  exception when others then if sqlerrm not like '%owner is always%' then raise; end if; end;
  begin perform public.set_company_admin(gen_random_uuid(), true); raise exception '2d: a person who does not exist was made an admin';
  exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
  reset role;

  -- 3. nobody else can: a new admin, a teammate, an outsider (who owns a different company), anon
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_company_admin(m_team, true); raise exception '3a: an admin who is not the owner made an admin';
  exception when others then if sqlerrm not like '%Only the owner%' then raise; end if; end;
  begin perform public.set_company_admin(m_staff, false); raise exception '3b: an admin demoted themself through the function';
  exception when others then if sqlerrm not like '%Only the owner%' then raise; end if; end;
  begin update public.workspace_members set role = 'manager' where id = m_team; raise exception '3c: an admin changed a role directly';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_company_admin(m_team, true); raise exception '3d: a teammate made themself an admin';
  exception when others then if sqlerrm not like '%Only the owner%' then raise; end if; end;
  begin update public.workspace_members set role = 'manager' where id = m_team; raise exception '3e: a teammate changed their own role directly';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_company_admin(m_team, true); raise exception '3f: the owner of ANOTHER company made someone an admin here';
  exception when others then if sqlerrm not like '%Only the owner%' then raise; end if; end;
  reset role;
  set local role anon;
  begin perform public.set_company_admin(m_team, true); raise exception '3g: anon could call set_company_admin';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 4. what a new admin gets: manager rights (reads company logins with emails)
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people() where email is not null;
  if n < 2 then raise exception '4a: a new admin does not get the manager view of the team (%)', n; end if;
  reset role;

  -- 5. groups: the owner and an admin manage them; people are only ever teammates of the same company
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.company_groups (workspace_id, name) values (noted, 'Booking team') returning id into g;
  insert into public.company_group_members (group_id, member_id) values (g, m_team), (g, m_new);
  begin insert into public.company_group_members (group_id, member_id) values (g, m_staff); raise exception '5a: an admin was put in a group';
  exception when insufficient_privilege then null; end;
  begin insert into public.company_group_members (group_id, member_id) values (g, m_art); raise exception '5b: an artist login was put in a group';
  exception when insufficient_privilege then null; end;
  begin insert into public.company_group_members (group_id, member_id) values (g, m_out); raise exception '5c: a person from another company was put in a group';
  exception when insufficient_privilege then null; end;
  begin insert into public.company_groups (workspace_id, name) values (noted, 'Booking team'); raise exception '5d: two groups with the same name';
  exception when unique_violation then null; end;
  begin insert into public.company_groups (workspace_id, name) values (noted, '   '); raise exception '5e: a blank group name';
  exception when check_violation then null; end;
  begin insert into public.company_groups (workspace_id, name) values (noted, repeat('x', 61)); raise exception '5f: a very long group name';
  exception when check_violation then null; end;
  begin insert into public.company_groups (workspace_id, name) values (out_ws, 'Not mine'); raise exception '5g: a group was made in another company';
  exception when insufficient_privilege then null; end;
  update public.company_groups set name = 'Booking' where id = g;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '5h: could not rename a group'; end if;
  reset role;

  -- 6. nobody else can see or change groups
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.company_groups; if n <> 0 then raise exception '6a: a teammate can read groups (%)', n; end if;
  select count(*) into n from public.company_group_members; if n <> 0 then raise exception '6b: a teammate can read group members (%)', n; end if;
  begin insert into public.company_groups (workspace_id, name) values (noted, 'Mine'); raise exception '6c: a teammate made a group';
  exception when insufficient_privilege then null; end;
  begin delete from public.company_groups where id = g; get diagnostics n = row_count; if n <> 0 then raise exception '6d: a teammate deleted a group'; end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.company_groups where workspace_id = noted; if n <> 0 then raise exception '6e: an outsider can read another company''s groups (%)', n; end if;
  begin insert into public.company_group_members (group_id, member_id) values (g, m_team); raise exception '6f: an outsider added to another company''s group';
  exception when insufficient_privilege then null; end;
  insert into public.company_groups (workspace_id, name) values (out_ws, 'Theirs') returning id into g_out;   -- their own company: allowed
  reset role;
  set local role anon;
  begin perform count(*) from public.company_groups; raise exception '6g: anon can read groups';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 7. the owner takes the admin back; leaving the company or being deleted takes people out of groups; groups have a ceiling
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_company_admin(m_staff, false);
  reset role;
  if (select role from public.workspace_members where id = m_staff) <> 'team' then raise exception '7a: the admin was not taken back'; end if;
  delete from public.workspace_members where id = m_new;
  select count(*) into n from public.company_group_members where group_id = g and member_id = m_new;
  if n <> 0 then raise exception '7b: a deleted person is still in a group'; end if;
  insert into public.company_groups (workspace_id, name) select noted, 'g' || i from generate_series(1, 48) i;   -- 49 groups now
  insert into public.company_groups (workspace_id, name) values (noted, 'the fiftieth');
  begin insert into public.company_groups (workspace_id, name) values (noted, 'the fifty-first'); raise exception '7c: more than 50 groups';
  exception when others then if sqlerrm not like '%up to 50 groups%' then raise; end if; end;

  raise exception 'ALL ADMIN AND GROUP CHECKS PASSED (rolled back)';
end $$;
