-- Run in the Supabase SQL editor (or as a dry run before applying 061). Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  mascolo text := 'mascolo-5mbcapr'; nimino text := 'nimino-7tohmry';
  owner uuid; m_owner uuid; inst uuid := '00000000-0000-0000-0000-000000000000';
  u_free uuid := gen_random_uuid(); u_staff uuid := gen_random_uuid(); u_other uuid := gen_random_uuid(); u_new uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid(); u_adm2 uuid := gen_random_uuid();
  e_free text; e_other text; e_new text;
  y uuid; z uuid; m_free uuid; m_staff uuid; m_adm uuid; m_adm2 uuid; m_new uuid; inv uuid; inv2 uuid; n int; r record; w uuid; t text[];
begin
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into m_owner from public.workspace_members where workspace_id = noted and user_id = owner and client_id is null;
  e_free := 'zz-free-' || left(u_free::text, 6) || '@example.invalid';
  e_other := 'zz-other-' || left(u_other::text, 6) || '@example.invalid';
  e_new := 'zz-new-' || left(u_new::text, 6) || '@example.invalid';
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at) values
    (u_free, e_free, inst, 'authenticated', 'authenticated', now()),   -- a freelancer who owns their own company Y
    (u_other, e_other, inst, 'authenticated', 'authenticated', now()), -- an unrelated person who owns company Z
    (u_staff, 'zz-staff-' || left(u_staff::text, 6) || '@example.invalid', inst, 'authenticated', 'authenticated', now()),
    (u_adm, 'zz-adm-' || left(u_adm::text, 6) || '@example.invalid', inst, 'authenticated', 'authenticated', now()),
    (u_adm2, 'zz-adm2-' || left(u_adm2::text, 6) || '@example.invalid', inst, 'authenticated', 'authenticated', now());
  select workspace_id into y from public.workspace_members where user_id = u_free;     -- company Y (made by the sign-up trigger)
  select workspace_id into z from public.workspace_members where user_id = u_other;
  delete from public.workspace_members where user_id in (u_staff, u_adm, u_adm2);
  insert into public.workspace_members (workspace_id, user_id, role, client_id) values
    (noted, u_staff, 'team', null), (noted, u_adm, 'manager', null), (noted, u_adm2, 'manager', null);
  select id into m_staff from public.workspace_members where user_id = u_staff;
  select id into m_adm from public.workspace_members where user_id = u_adm;
  select id into m_adm2 from public.workspace_members where user_id = u_adm2;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('zz-g-staff', m_staff, 'tour', mascolo, false);

  -- 1. the team list for one company
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people(y); if n < 1 then raise exception '1a: the owner of Y cannot read Y''s people'; end if;
  select count(*) into n from public.workspace_people(y) where email is not null; if n < 1 then raise exception '1b: a manager should be given the emails'; end if;
  select count(*) into n from public.workspace_people(noted); if n <> 0 then raise exception '1c: an outsider read Noted''s people (%)', n; end if;
  select count(*) into n from public.workspace_people(); if n < 1 then raise exception '1d: the default should be the caller''s own company'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people(noted) where user_id = u_staff and email is not null; if n <> 1 then raise exception '1e: the owner should see the staff login and email'; end if;
  select count(*) into n from public.workspace_people() where user_id = u_staff; if n <> 1 then raise exception '1f: the default should be the owner''s company'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people(noted); if n < 1 then raise exception '1g: a teammate should still see who is on the team'; end if;
  select count(*) into n from public.workspace_people(noted) where email is not null; if n <> 0 then raise exception '1h: a teammate was given emails (%)', n; end if;
  reset role;

  -- 2. someone who already has a login is invited to Noted: they are offered it, and nobody else is
  insert into public.pending_invites (email, workspace_id, role, access, created_by)
  values (e_free, noted, 'team', jsonb_build_array(jsonb_build_object('section', 'tour', 'client_id', mascolo, 'can_edit', false), jsonb_build_object('section', 'music', 'client_id', mascolo, 'can_edit', true)), owner) returning id into inv;
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_company_invites(); if n <> 1 then raise exception '2a: the invited person should be offered 1 invitation (%)', n; end if;
  select * into r from public.my_company_invites();
  if r.company <> 'Noted Management' or r.role <> 'team' or r.artists <> array['Mascolo'] then raise exception '2b: the offer reads wrong (%, %, %)', r.company, r.role, r.artists; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_company_invites(); if n <> 0 then raise exception '2c: an unrelated person was offered someone else''s invitation'; end if;
  begin perform public.accept_company_invite(inv); raise exception '2d: someone else accepted another person''s invitation';
  exception when others then if sqlerrm not like '%no longer available%' then raise; end if; end;
  perform public.decline_company_invite(inv);   -- declining someone else's invitation does nothing
  reset role;
  if not exists (select 1 from public.pending_invites where id = inv) then raise exception '2e: someone else declined another person''s invitation'; end if;

  -- 3. accepting: the membership and exactly the invited pages, and nothing more
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  w := public.accept_company_invite(inv);
  reset role;
  if w <> noted then raise exception '3a: wrong company returned'; end if;
  select id into m_free from public.workspace_members where user_id = u_free and workspace_id = noted;
  if m_free is null then raise exception '3b: no membership was created'; end if;
  if (select role from public.workspace_members where id = m_free) <> 'team' then raise exception '3c: wrong role'; end if;
  select count(*) into n from public.access_grants where workspace_member_id = m_free; if n <> 2 then raise exception '3d: expected 2 pages, got %', n; end if;
  select count(*) into n from public.access_grants where workspace_member_id = m_free and client_id = mascolo and section = 'tour' and can_edit = false; if n <> 1 then raise exception '3e: the tour page is wrong'; end if;
  if not exists (select 1 from public.pending_invites where id = inv and used_at is not null) then raise exception '3f: the invitation was not used up'; end if;
  if (select count(*) from public.workspace_members where user_id = u_free) <> 2 then raise exception '3g: they should now be in two companies'; end if;
  set local role authenticated;
  begin perform public.accept_company_invite(inv); raise exception '3h: an invitation was accepted twice';
  exception when others then if sqlerrm not like '%no longer available%' then raise; end if; end;
  reset role;

  -- 4. one login in two companies: the right power in each (the point of all this)
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(mascolo, 'tour') then raise exception '4a: cannot see the page they were given'; end if;
  if public.has_section_access(mascolo, 'tour', true) then raise exception '4b: can change a look-only page'; end if;
  if not public.has_section_access(mascolo, 'music', true) then raise exception '4c: cannot change the music page they were given'; end if;
  if public.has_section_access(mascolo, 'finance') then raise exception '4d: sees money they were not given'; end if;
  if public.can_open_client(nimino) then raise exception '4e: can open an artist they were not given'; end if;
  if public.is_manager_of_workspace(noted) then raise exception '4f: a freelancer in Noted counts as a manager there'; end if;
  if not public.is_manager_of_workspace(y) then raise exception '4g: the owner of Y is not a manager of Y'; end if;
  begin perform public.set_company_admin(m_staff, true); raise exception '4h: a freelancer in Noted made an admin there';
  exception when others then if sqlerrm not like '%Only the owner%' then raise; end if; end;
  begin perform public.remove_company_member(m_staff); raise exception '4i: a freelancer in Noted removed someone';
  exception when others then if sqlerrm not like '%Only a manager%' then raise; end if; end;
  select count(*) into n from public.workspace_people(noted) where email is not null; if n <> 0 then raise exception '4j: emails leaked to a freelancer (%)', n; end if;
  select count(*) into n from public.workspace_people(y) where email is not null; if n < 1 then raise exception '4k: the owner of Y should be given the emails in Y'; end if;
  reset role;

  -- 5. an old invitation is not offered or accepted
  insert into public.pending_invites (email, workspace_id, role, access, created_by, created_at)
  values (e_other, noted, 'team', '[]'::jsonb, owner, now() - interval '15 days') returning id into inv2;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.my_company_invites(); if n <> 0 then raise exception '5a: an expired invitation was offered'; end if;
  begin perform public.accept_company_invite(inv2); raise exception '5b: an expired invitation was accepted';
  exception when others then if sqlerrm not like '%no longer available%' then raise; end if; end;
  reset role;

  -- 6. declining your own invitation removes it
  insert into public.pending_invites (email, workspace_id, role, access, created_by) values (e_other, noted, 'agent', '[]'::jsonb, owner) returning id into inv2;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.decline_company_invite(inv2);
  reset role;
  if exists (select 1 from public.pending_invites where id = inv2) then raise exception '6a: the invitation was not removed'; end if;

  -- 7. what a manager sees and can do about waiting invitations
  insert into public.pending_invites (email, workspace_id, role, access, created_by) values ('zz-waiting-' || left(u_new::text, 6) || '@example.invalid', noted, 'team', '[]'::jsonb, owner) returning id into inv2;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.company_pending_invites() where invite_id = inv2; if n <> 1 then raise exception '7a: the owner cannot see a waiting invitation'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.company_pending_invites(); if n <> 0 then raise exception '7b: a teammate sees waiting invitations'; end if;
  begin perform public.cancel_company_invite(inv2); raise exception '7c: a teammate cancelled an invitation';
  exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.company_pending_invites() where workspace_id = noted; if n <> 0 then raise exception '7d: another company''s manager sees Noted''s invitations'; end if;
  begin perform public.cancel_company_invite(inv2); raise exception '7e: another company''s manager cancelled the invitation';
  exception when others then if sqlerrm not like '%not found%' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.cancel_company_invite(inv2);
  reset role;
  if exists (select 1 from public.pending_invites where id = inv2) then raise exception '7f: the owner could not cancel an invitation'; end if;

  -- 8. regression: a brand-new person invited by email still joins with exactly their pages (no company of their own)
  select count(*) into n from public.workspaces;
  insert into public.pending_invites (email, workspace_id, role, access, created_by)
  values (e_new, noted, 'team', jsonb_build_array(jsonb_build_object('section', 'tour', 'client_id', mascolo, 'can_edit', false)), owner);
  insert into auth.users (id, email, instance_id, aud, role) values (u_new, e_new, inst, 'authenticated', 'authenticated');
  if (select count(*) from public.workspaces) <> n then raise exception '8a: a new invited person got a company of their own'; end if;
  select id into m_new from public.workspace_members where user_id = u_new and workspace_id = noted;
  if m_new is null then raise exception '8b: the new person did not join'; end if;
  select count(*) into n from public.access_grants where workspace_member_id = m_new and client_id = mascolo and section = 'tour' and can_edit = false;
  if n <> 1 then raise exception '8c: the new person''s pages are wrong'; end if;

  -- 9. leaving
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.leave_company(noted); raise exception '9a: the owner left the company';
  exception when others then if sqlerrm not like '%owner cannot leave%' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_free, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_company(noted);
  begin perform public.leave_company(noted); raise exception '9b: left a company twice';
  exception when others then if sqlerrm not like '%not part%' then raise; end if; end;
  begin perform public.leave_company(y); raise exception '9c: the owner of Y left Y';
  exception when others then if sqlerrm not like '%owner cannot leave%' then raise; end if; end;
  reset role;
  if exists (select 1 from public.workspace_members where user_id = u_free and workspace_id = noted) then raise exception '9d: still a member after leaving'; end if;
  select count(*) into n from public.access_grants where workspace_member_id = m_free; if n <> 0 then raise exception '9e: their pages stayed behind (%)', n; end if;
  if not exists (select 1 from public.workspace_members where user_id = u_free and workspace_id = y) then raise exception '9f: leaving Noted removed them from their own company'; end if;
  if not exists (select 1 from auth.users where id = u_free) then raise exception '9g: leaving removed the login'; end if;

  -- 10. removing someone from the company
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.remove_company_member(m_owner); raise exception '10a: an admin removed the owner';
  exception when others then if sqlerrm not like '%owner cannot be removed%' then raise; end if; end;
  begin perform public.remove_company_member(m_adm2); raise exception '10b: an admin removed another admin';
  exception when others then if sqlerrm not like '%Only the owner can remove an admin%' then raise; end if; end;
  begin perform public.remove_company_member(m_adm); raise exception '10c: someone removed themself through the function';
  exception when others then if sqlerrm not like '%Leave this company%' then raise; end if; end;
  perform public.remove_company_member(m_staff);   -- an admin may remove ordinary staff
  reset role;
  if exists (select 1 from public.workspace_members where id = m_staff) then raise exception '10d: the staff member is still there'; end if;
  if exists (select 1 from public.access_grants where workspace_member_id = m_staff) then raise exception '10e: their pages stayed behind'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.remove_company_member(m_new); raise exception '10f: another company''s manager removed someone from Noted';
  exception when others then if sqlerrm not like '%Only a manager%' then raise; end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.remove_company_member(m_adm2);   -- the owner may remove an admin
  reset role;
  if exists (select 1 from public.workspace_members where id = m_adm2) then raise exception '10g: the owner could not remove an admin'; end if;
  set local role anon;
  begin perform public.remove_company_member(m_new); raise exception '10h: anon removed a member';
  exception when insufficient_privilege then null; end;
  begin perform * from public.my_company_invites(); raise exception '10i: anon read invitations';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL COMPANY INVITATION CHECKS PASSED (rolled back)';
end $$;
