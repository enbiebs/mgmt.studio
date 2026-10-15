-- Invitations are controlled by the server: a new account can no longer choose its own workspace or role.
--
-- An invitation is a row in a server-only table that only OUR server writes (the invite route, after checking the
-- inviter is a manager). When an account is created, the database gives it a place in an existing workspace only
-- if an unused invitation under 14 days old exists for that email address, and takes the workspace, role, person
-- and artist from THAT ROW, never from details the account supplies about itself. Everyone else gets their own
-- empty workspace, exactly as before. (Also worth doing in the Supabase dashboard: turn off "Allow new users to
-- sign up", since invitations do not need it.)
create table if not exists public.pending_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and char_length(email) <= 254),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role         text not null check (role in ('team', 'agent', 'lawyer', 'artist')),
  person_id    text references public.people(id) on delete set null,
  client_id    text references public.clients(id) on delete cascade,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  used_at      timestamptz,
  check (role <> 'artist' or client_id is not null)
);
create index if not exists pending_invites_email_idx on public.pending_invites (email) where used_at is null;
alter table public.pending_invites enable row level security;     -- no policies on purpose: only the server's own key can reach it
revoke all on public.pending_invites from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
  inv record;
begin
  select * into inv from public.pending_invites p
   where p.email = lower(new.email) and p.used_at is null and p.created_at > now() - interval '14 days'
   order by p.created_at desc limit 1;

  if found then
    insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
    values (inv.workspace_id, new.id, inv.role, inv.person_id, inv.client_id);
    update public.pending_invites set used_at = now() where id = inv.id;
  else
    -- Anything the new account says about another workspace is ignored: it just gets its own.
    insert into public.workspaces (name)
    values (coalesce(nullif(left(new.raw_user_meta_data->>'workspace_name', 80), ''), split_part(new.email, '@', 1)))
    returning id into new_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'manager');
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
