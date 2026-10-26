-- The artist can approve a version of a track. A manager asks ("send for approval"), the artist listens and answers "I approve it" or "I want
-- changes" with a note, and everyone sees the answer next to that version. Everything here is ADDITIVE: new columns on track_rounds (all
-- empty for existing rounds), one guard, one function, and a "no blank ids" rule. Nothing existing changes meaning.
--
-- WHO MAY DO WHAT, enforced here and not only on screen:
--   * Asking (or withdrawing the request) is an ordinary change to the round, so it needs the same Music edit access as any other change.
--   * Answering is NOT an ordinary change. An answer can only be written by the artist's own login, through decide_round() below. The guard
--     trigger refuses any other way of writing "approved" or "changes" (it needs the function's own transaction-local flag AND that the
--     statement runs as the function's owner, not as a signed-in person), and it wipes the answer fields whenever a request is sent again,
--     so nobody can put words in the artist's mouth or edit a recorded answer.
--   * "Approved" is final for that version. To get a second look, upload a new version and ask about that one. "I want changes" can be asked
--     about again (that wipes the old answer). Changing a version's audio after it was asked about clears the request; after it was
--     approved it is refused.
--   * The artist already READS their own rounds and audio (they hold read access to every section of their own artist); that is unchanged.
alter table track_rounds add column if not exists approval          text check (approval is null or approval in ('awaiting', 'approved', 'changes'));
alter table track_rounds add column if not exists approval_asked_at timestamptz;
alter table track_rounds add column if not exists approval_by       text;
alter table track_rounds add column if not exists approval_at       timestamptz;
alter table track_rounds add column if not exists approval_note     text check (approval_note is null or char_length(approval_note) <= 1000);
alter table track_rounds add column if not exists approval_member   uuid;      -- which login answered (so it is never just a name someone could claim)

-- A blank id would let the guard below mistake an unset flag for "being decided now". Ids are never blank.
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

-- The artist's answer. Only the artist's own login for the artist that owns this track, only while the version is waiting for an answer.
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
