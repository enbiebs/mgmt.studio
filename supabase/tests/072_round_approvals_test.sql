-- Tests supabase/migrations/072_round_approvals.sql against the live database. It APPLIES the migration inside the test (and applies it a
-- second time, to prove it can be re-run), then ends with an intentional error, so NOTHING is kept. Generated from the migration file. Success:
--   ERROR: ALL 072 CHECKS PASSED (rolled back)
do $test$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  tag text := left(gen_random_uuid()::text, 6);
  cid text := 'zz-client-' || tag;  cid2 text := 'zz-client2-' || tag;
  alb text := 'zz-album-' || tag;   alb2 text := 'zz-album2-' || tag;
  trk text := 'zz-track-' || tag;   trk2 text := 'zz-track2-' || tag;
  r1 text := 'zz-round1-' || tag;   r2 text := 'zz-round2-' || tag;   r3 text := 'zz-round3-' || tag;
  artist_u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid(); team_u uuid := gen_random_uuid(); viewer_u uuid := gen_random_uuid();
  team_m uuid; ok boolean; rec record; n int;
begin
  execute $apply$
alter table track_rounds add column if not exists approval          text check (approval is null or approval in ('awaiting', 'approved', 'changes'));
alter table track_rounds add column if not exists approval_asked_at timestamptz;
alter table track_rounds add column if not exists approval_by       text;
alter table track_rounds add column if not exists approval_at       timestamptz;
alter table track_rounds add column if not exists approval_note     text check (approval_note is null or char_length(approval_note) <= 1000);
alter table track_rounds add column if not exists approval_member   uuid;      -- which login answered (so it is never just a name someone could claim)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'track_rounds_id_not_blank' and conrelid = 'public.track_rounds'::regclass) then
    alter table public.track_rounds add constraint track_rounds_id_not_blank check (btrim(id) <> '');
  end if;
end
$$;

create or replace function public.track_round_approval_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Only decide_round sets the flag (to the round's id) and it runs as the function's owner; a signed-in person's own statement runs as
  -- "authenticated", so setting the flag by hand does not help them. A blank id can never match.
  deciding boolean := coalesce(nullif(current_setting('app.deciding_round', true), '') = new.id, false)
                      and current_user not in ('anon', 'authenticated');
  changed boolean := true;                                   -- a new round counts as a change from "no answer"
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then raise exception 'A version''s id cannot change'; end if;
    changed := new.approval is distinct from old.approval;
    if old.approval is not null and (new.audio_path is distinct from old.audio_path or new.duration is distinct from old.duration) then
      if old.approval = 'approved' then raise exception 'This version was approved. Upload a new version instead'; end if;
      new.approval := null; changed := true;                 -- different audio: the request no longer applies
    end if;
    if changed and old.approval = 'approved' and not deciding then raise exception 'An approved version stays approved. Upload a new version to ask again'; end if;
  end if;
  if changed then
    if new.approval in ('approved', 'changes') then
      if not deciding then raise exception 'Only the artist can answer a request for approval'; end if;
      -- (decide_round filled in who, when and the note)
    elsif new.approval = 'awaiting' then
      new.approval_asked_at := now(); new.approval_by := null; new.approval_at := null; new.approval_note := null; new.approval_member := null;
    elsif new.approval is null then
      new.approval_asked_at := null; new.approval_by := null; new.approval_at := null; new.approval_note := null; new.approval_member := null;
    else
      raise exception 'Unknown approval value';
    end if;
  elsif not deciding then
    -- nothing about the answer changed: the recorded fields cannot be edited by hand
    new.approval_asked_at := old.approval_asked_at; new.approval_by := old.approval_by; new.approval_at := old.approval_at;
    new.approval_note := old.approval_note; new.approval_member := old.approval_member;
  end if;
  return new;
end;
$$;
revoke execute on function public.track_round_approval_guard() from public, anon, authenticated;
drop trigger if exists track_round_approval_guard on public.track_rounds;
create trigger track_round_approval_guard before insert or update on public.track_rounds
  for each row execute function public.track_round_approval_guard();

create or replace function public.decide_round(p_round text, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  current_status text;
  who text;
  member uuid;
  note text;
begin
  if p_decision is null or p_decision not in ('approved', 'changes') then raise exception 'The answer must be approved or changes'; end if;
  if p_note is not null and char_length(p_note) > 5000 then raise exception 'Please keep the note under 1000 characters'; end if;
  note := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  if note is not null and char_length(note) > 1000 then raise exception 'Please keep the note under 1000 characters'; end if;

  -- Who is asking comes first, before anything is locked: the artist's own login for this artist (and allowed in with the usual rules).
  select a.client_id into cid
    from public.track_rounds r
    join public.tracks t on t.id = r.track_id
    join public.albums a on a.id = t.album_id
   where r.id = p_round;
  select wm.id into member from public.workspace_members wm
   where wm.user_id = auth.uid() and wm.client_id = cid and wm.role = 'artist' and cid is not null;
  if member is null or not public.has_section_access(cid, 'music') then raise exception 'That version was not found'; end if;   -- the same answer for "not yours" and "does not exist"

  select r.approval into current_status from public.track_rounds r where r.id = p_round for update;
  if current_status is distinct from 'awaiting' then raise exception 'That version is not waiting for an answer'; end if;

  select c.name into who from public.clients c where c.id = cid;
  perform set_config('app.deciding_round', p_round, true);
  update public.track_rounds
     set approval = p_decision, approval_by = who, approval_at = now(), approval_note = note, approval_member = member
   where id = p_round;
  perform set_config('app.deciding_round', '', true);
end;
$$;
revoke all on function public.decide_round(text, text, text) from public, anon;
grant execute on function public.decide_round(text, text, text) to authenticated;
  $apply$;

  insert into public.clients (id, workspace_id, name) values (cid, noted, 'ZZ Artist'), (cid2, noted, 'ZZ Other Artist');
  insert into public.albums (id, client_id, title) values (alb, cid, 'A'), (alb2, cid2, 'B');
  insert into public.tracks (id, album_id, num, title) values (trk, alb, 1, 'T1'), (trk2, alb2, 1, 'T2');
  insert into auth.users (id, email) values (artist_u, 'zz-a-' || tag || '@example.com'), (other_u, 'zz-o-' || tag || '@example.com'),
                                           (team_u, 'zz-t-' || tag || '@example.com'), (viewer_u, 'zz-v-' || tag || '@example.com');
  insert into public.workspace_members (workspace_id, user_id, role, client_id) values (noted, artist_u, 'artist', cid), (noted, other_u, 'artist', cid2);
  insert into public.workspace_members (workspace_id, user_id, role) values (noted, team_u, 'team'), (noted, viewer_u, 'team');
  -- an editor: Music EDIT for this artist; and a viewer: Music VIEW only
  select id into team_m from public.workspace_members where user_id = team_u and workspace_id = noted;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('zz-g1-' || tag, team_m, 'music', cid, true);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) select 'zz-g2-' || tag, id, 'music', cid, false from public.workspace_members where user_id = viewer_u and workspace_id = noted;

  insert into public.track_rounds (id, track_id, label, audio_path, duration) values (r1, trk, 'V1', 'x/r1.mp3', 100), (r2, trk2, 'V1', 'x/r2.mp3', 100), (r3, trk, 'V2', 'x/r3.mp3', 100);
  select * into rec from public.track_rounds where id = r1;
  assert rec.approval is null and rec.approval_asked_at is null and rec.approval_by is null and rec.approval_member is null, 'a new round has no approval';

  -- ids: never blank, never changed (a blank id would have switched the guard off)
  ok := false; begin insert into public.track_rounds (id, track_id, label, approval, approval_by) values ('', trk, 'X', 'approved', 'ZZ Artist'); exception when others then ok := true; end;
  assert ok, 'a blank id is refused';
  ok := false; begin insert into public.track_rounds (id, track_id, label) values ('   ', trk, 'X'); exception when others then ok := true; end;
  assert ok, 'a blank-looking id is refused';
  ok := false; begin update public.track_rounds set id = '' where id = r3; exception when others then ok := true; end;
  assert ok, 'an id cannot become blank';
  ok := false; begin update public.track_rounds set id = r3 || 'x' where id = r3; exception when others then ok := true; end;
  assert ok, 'an id cannot change at all';
  ok := false; begin insert into public.track_rounds (id, track_id, label, approval) values ('zz-bad-' || tag, trk, 'X', 'approved'); exception when others then ok := true; end;
  assert ok, 'a round cannot be created already approved';

  -- asking: an ordinary change; the request time is set by the database and any answer fields typed in are wiped
  update public.track_rounds set approval = 'awaiting', approval_by = 'Someone', approval_at = now(), approval_note = 'fake', approval_member = artist_u where id = r1;
  select * into rec from public.track_rounds where id = r1;
  assert rec.approval = 'awaiting' and rec.approval_asked_at is not null, 'asked';
  assert rec.approval_by is null and rec.approval_at is null and rec.approval_note is null and rec.approval_member is null, 'answer fields typed in with a request are wiped';
  ok := false; begin update public.track_rounds set approval = 'approved' where id = r1; exception when others then ok := true; end;
  assert ok, 'approved cannot be written by hand'; 
  ok := false; begin update public.track_rounds set approval = 'bogus' where id = r1; exception when others then ok := true; end;
  assert ok, 'an unknown value is refused';

  -- as a real signed-in editor (Music edit): can ask, take back, ask again; cannot write an answer, even with the flag set by hand
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', team_u, 'role', 'authenticated')::text, true);
  update public.track_rounds set approval = null where id = r1;
  get diagnostics n = row_count; assert n = 1, 'an editor can take a request back';
  update public.track_rounds set approval = 'awaiting' where id = r1;
  get diagnostics n = row_count; assert n = 1, 'an editor can ask';
  ok := false; begin update public.track_rounds set approval = 'approved', approval_by = 'ZZ Artist' where id = r1; exception when others then ok := true; end;
  assert ok, 'an editor cannot write approved';
  perform set_config('app.deciding_round', r1, true);                                   -- even if they get the flag set (they cannot through the API)...
  ok := false; begin update public.track_rounds set approval = 'approved', approval_by = 'ZZ Artist', approval_note = 'forged' where id = r1; exception when others then ok := true; end;
  assert ok, '...the guard also needs the statement to run as the function''s owner, so the flag alone does nothing';
  ok := false; begin insert into public.track_rounds (id, track_id, label, approval, approval_by) values ('zz-forge-' || tag, trk, 'X', 'approved', 'ZZ Artist'); exception when others then ok := true; end;
  assert ok, 'an editor cannot create an approved round (flag or no flag)';
  perform set_config('app.deciding_round', '', true);
  reset role;

  -- a viewer (Music view only) cannot ask at all
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', viewer_u, 'role', 'authenticated')::text, true);
  update public.track_rounds set approval = null where id = r1;
  get diagnostics n = row_count; assert n = 0, 'a viewer cannot change a round';
  reset role;

  -- the artist answers (as the artist's own login)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', artist_u, 'role', 'authenticated')::text, true);
  perform public.decide_round(r1, 'approved', '  Love it  ');
  reset role;
  select * into rec from public.track_rounds where id = r1;
  assert rec.approval = 'approved' and rec.approval_by = 'ZZ Artist' and rec.approval_at is not null and rec.approval_note = 'Love it' and rec.approval_member is not null, 'the artists answer is recorded with their name, login, the time and the trimmed note';
  assert coalesce(current_setting('app.deciding_round', true), '') = '', 'the deciding flag is cleared';

  -- a recorded answer cannot be edited, taken away or reopened by hand: approved is final
  update public.track_rounds set approval_note = 'edited', approval_by = 'Me', approval_member = null where id = r1;
  select * into rec from public.track_rounds where id = r1;
  assert rec.approval_note = 'Love it' and rec.approval_by = 'ZZ Artist' and rec.approval_member is not null, 'a recorded answer cannot be edited';
  ok := false; begin update public.track_rounds set approval = null where id = r1; exception when others then ok := true; end;
  assert ok, 'approved cannot be cleared';
  ok := false; begin update public.track_rounds set approval = 'awaiting' where id = r1; exception when others then ok := true; end;
  assert ok, 'approved cannot be reopened';
  ok := false; begin update public.track_rounds set audio_path = 'x/other.mp3' where id = r1; exception when others then ok := true; end;
  assert ok, 'the audio of an approved version cannot be swapped';
  ok := false; begin update public.track_rounds set duration = 5 where id = r1; exception when others then ok := true; end;
  assert ok, 'the length of an approved version cannot change';
  -- ...and an upsert the way the app sends one leaves the answer alone, and cannot carry one
  insert into public.track_rounds (id, track_id, label, stage, audio_path, duration, sort_order, created_at) values (r1, trk, 'V1 renamed', 'mix', 'x/r1.mp3', 100, 0, now())
    on conflict (id) do update set label = excluded.label, track_id = excluded.track_id, stage = excluded.stage, audio_path = excluded.audio_path, duration = excluded.duration, sort_order = excluded.sort_order, created_at = excluded.created_at;
  select * into rec from public.track_rounds where id = r1;
  assert rec.label = 'V1 renamed' and rec.approval = 'approved' and rec.approval_note = 'Love it', 'a normal save of the round keeps the answer';
  ok := false; begin insert into public.track_rounds (id, track_id, label, approval) values (r1, trk, 'X', 'changes') on conflict (id) do update set approval = excluded.approval; exception when others then ok := true; end;
  assert ok, 'an upsert cannot carry an answer in';

  -- it is no longer waiting, so it cannot be answered again
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', artist_u, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.decide_round(r1, 'changes', 'x'); exception when others then ok := true; end;
  assert ok, 'an answered version cannot be answered again';
  reset role;

  -- "I want changes" can be asked about again, which wipes the old answer, or taken back
  update public.track_rounds set approval = 'awaiting' where id = r2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', other_u, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.decide_round(r1, 'approved', null); exception when others then ok := true; end;
  assert ok, 'another artist cannot answer for this artist';
  perform public.decide_round(r2, 'changes', 'Needs more low end');
  reset role;
  assert (select approval_note from public.track_rounds where id = r2) = 'Needs more low end' and (select approval from public.track_rounds where id = r2) = 'changes', 'the other artists own answer went through';
  update public.track_rounds set approval = 'awaiting' where id = r2;
  select * into rec from public.track_rounds where id = r2;
  assert rec.approval = 'awaiting' and rec.approval_by is null and rec.approval_at is null and rec.approval_note is null and rec.approval_member is null, 'asking again after "changes" wipes the old answer';
  update public.track_rounds set approval = 'awaiting' where id = r2;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', other_u, 'role', 'authenticated')::text, true);
  perform public.decide_round(r2, 'changes', null);
  reset role;
  update public.track_rounds set approval = null where id = r2;
  assert (select approval from public.track_rounds where id = r2) is null, 'a "changes" answer can be taken off by management (they upload a new version)';

  -- different audio after a request: the request is cleared (the artist heard something else)
  update public.track_rounds set approval = 'awaiting' where id = r3;
  update public.track_rounds set audio_path = 'x/r3b.mp3' where id = r3;
  select * into rec from public.track_rounds where id = r3;
  assert rec.approval is null and rec.audio_path = 'x/r3b.mp3', 'changing the audio clears the request';

  -- who may answer: not a team member (even an editor), not a stranger, not for a made-up round, not with a bad answer or note
  update public.track_rounds set approval = 'awaiting' where id = r3;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', team_u, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.decide_round(r3, 'approved', null); exception when others then ok := true; end;
  assert ok, 'a team member with Music edit cannot answer for the artist';
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  ok := false; begin perform public.decide_round(r3, 'approved', null); exception when others then ok := true; end;
  assert ok, 'a stranger cannot answer';
  perform set_config('request.jwt.claims', json_build_object('sub', artist_u, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.decide_round('zz-nope', 'approved', null); exception when others then ok := true; end;
  assert ok, 'a version that does not exist';
  ok := false; begin perform public.decide_round(r3, 'maybe', null); exception when others then ok := true; end;
  assert ok, 'an unknown answer';
  ok := false; begin perform public.decide_round(r3, null, null); exception when others then ok := true; end;
  assert ok, 'no answer at all is refused (it must not clear the request)';
  assert (select approval from public.track_rounds where id = r3) = 'awaiting', 'the request is still there';
  ok := false; begin perform public.decide_round(r3, 'approved', repeat('x', 1001)); exception when others then ok := true; end;
  assert ok, 'a note over 1000 characters';
  ok := false; begin perform public.decide_round(r3, 'approved', repeat(' ', 6000)); exception when others then ok := true; end;
  assert ok, 'an enormous note is refused before anything is done with it';
  perform public.decide_round(r3, 'changes', E' \n\t  ');
  reset role;
  assert (select approval_note from public.track_rounds where id = r3) is null and (select approval from public.track_rounds where id = r3) = 'changes', 'a blank note (even only line breaks) is stored as nothing';

  -- privileges
  assert not has_function_privilege('anon', 'public.decide_round(text,text,text)', 'execute'), 'anon cannot call it';
  assert has_function_privilege('authenticated', 'public.decide_round(text,text,text)', 'execute'), 'signed-in people can call it (it checks who they are)';
  assert not has_function_privilege('authenticated', 'public.track_round_approval_guard()', 'execute'), 'the guard is not callable';

  -- applying the migration a second time changes nothing and does not fail
  execute $again$ alter table track_rounds add column if not exists approval          text check (approval is null or approval in ('awaiting', 'approved', 'changes'));
alter table track_rounds add column if not exists approval_asked_at timestamptz;
alter table track_rounds add column if not exists approval_by       text;
alter table track_rounds add column if not exists approval_at       timestamptz;
alter table track_rounds add column if not exists approval_note     text check (approval_note is null or char_length(approval_note) <= 1000);
alter table track_rounds add column if not exists approval_member   uuid;      -- which login answered (so it is never just a name someone could claim)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'track_rounds_id_not_blank' and conrelid = 'public.track_rounds'::regclass) then
    alter table public.track_rounds add constraint track_rounds_id_not_blank check (btrim(id) <> '');
  end if;
end
$$;

create or replace function public.track_round_approval_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Only decide_round sets the flag (to the round's id) and it runs as the function's owner; a signed-in person's own statement runs as
  -- "authenticated", so setting the flag by hand does not help them. A blank id can never match.
  deciding boolean := coalesce(nullif(current_setting('app.deciding_round', true), '') = new.id, false)
                      and current_user not in ('anon', 'authenticated');
  changed boolean := true;                                   -- a new round counts as a change from "no answer"
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then raise exception 'A version''s id cannot change'; end if;
    changed := new.approval is distinct from old.approval;
    if old.approval is not null and (new.audio_path is distinct from old.audio_path or new.duration is distinct from old.duration) then
      if old.approval = 'approved' then raise exception 'This version was approved. Upload a new version instead'; end if;
      new.approval := null; changed := true;                 -- different audio: the request no longer applies
    end if;
    if changed and old.approval = 'approved' and not deciding then raise exception 'An approved version stays approved. Upload a new version to ask again'; end if;
  end if;
  if changed then
    if new.approval in ('approved', 'changes') then
      if not deciding then raise exception 'Only the artist can answer a request for approval'; end if;
      -- (decide_round filled in who, when and the note)
    elsif new.approval = 'awaiting' then
      new.approval_asked_at := now(); new.approval_by := null; new.approval_at := null; new.approval_note := null; new.approval_member := null;
    elsif new.approval is null then
      new.approval_asked_at := null; new.approval_by := null; new.approval_at := null; new.approval_note := null; new.approval_member := null;
    else
      raise exception 'Unknown approval value';
    end if;
  elsif not deciding then
    -- nothing about the answer changed: the recorded fields cannot be edited by hand
    new.approval_asked_at := old.approval_asked_at; new.approval_by := old.approval_by; new.approval_at := old.approval_at;
    new.approval_note := old.approval_note; new.approval_member := old.approval_member;
  end if;
  return new;
end;
$$;
revoke execute on function public.track_round_approval_guard() from public, anon, authenticated;
drop trigger if exists track_round_approval_guard on public.track_rounds;
create trigger track_round_approval_guard before insert or update on public.track_rounds
  for each row execute function public.track_round_approval_guard();

create or replace function public.decide_round(p_round text, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid text;
  current_status text;
  who text;
  member uuid;
  note text;
begin
  if p_decision is null or p_decision not in ('approved', 'changes') then raise exception 'The answer must be approved or changes'; end if;
  if p_note is not null and char_length(p_note) > 5000 then raise exception 'Please keep the note under 1000 characters'; end if;
  note := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  if note is not null and char_length(note) > 1000 then raise exception 'Please keep the note under 1000 characters'; end if;

  -- Who is asking comes first, before anything is locked: the artist's own login for this artist (and allowed in with the usual rules).
  select a.client_id into cid
    from public.track_rounds r
    join public.tracks t on t.id = r.track_id
    join public.albums a on a.id = t.album_id
   where r.id = p_round;
  select wm.id into member from public.workspace_members wm
   where wm.user_id = auth.uid() and wm.client_id = cid and wm.role = 'artist' and cid is not null;
  if member is null or not public.has_section_access(cid, 'music') then raise exception 'That version was not found'; end if;   -- the same answer for "not yours" and "does not exist"

  select r.approval into current_status from public.track_rounds r where r.id = p_round for update;
  if current_status is distinct from 'awaiting' then raise exception 'That version is not waiting for an answer'; end if;

  select c.name into who from public.clients c where c.id = cid;
  perform set_config('app.deciding_round', p_round, true);
  update public.track_rounds
     set approval = p_decision, approval_by = who, approval_at = now(), approval_note = note, approval_member = member
   where id = p_round;
  perform set_config('app.deciding_round', '', true);
end;
$$;
revoke all on function public.decide_round(text, text, text) from public, anon;
grant execute on function public.decide_round(text, text, text) to authenticated; $again$;
  assert (select approval from public.track_rounds where id = r1) = 'approved', 're-applying keeps the data';

  raise exception 'ALL 072 CHECKS PASSED (rolled back)';
end
$test$;
