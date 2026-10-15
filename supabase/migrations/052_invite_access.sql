-- An invitation can now carry the access the inviter chose (role, level, pages, which artists).
--
-- The invite route (manager only) validates the choice and stores it on the pending_invites row, a table only our own
-- server key can reach. When the invited login is created (Supabase creates it the moment the invite email goes out),
-- the sign-up trigger sets that access up from THE ROW, never from anything the new account says about itself, and
-- only for this company's real artists, only for the ordinary page sections: never the vault, never a demo artist,
-- never a Point Person row that is not a single artist with edit. If anything about the access is wrong the person is
-- still created (sign-up must never fail) and the reason is recorded on the invite row.
--
-- Also: workspace_people() now says whether a login has ever signed in, so the app can show "invited, waiting".
alter table public.pending_invites
  add column if not exists access jsonb not null default '[]'::jsonb,
  add column if not exists apply_error text;
alter table public.pending_invites drop constraint if exists pending_invites_access_shape;
alter table public.pending_invites add constraint pending_invites_access_shape
  check (jsonb_typeof(access) = 'array' and jsonb_array_length(access) <= 300);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
  new_member_id uuid;
  inv record;
begin
  select * into inv from public.pending_invites p
   where p.email = lower(new.email) and p.used_at is null and p.created_at > now() - interval '14 days'
   order by p.created_at desc limit 1;

  if found then
    insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
    values (inv.workspace_id, new.id, inv.role, inv.person_id, inv.client_id)
    returning id into new_member_id;
    update public.pending_invites set used_at = now() where id = inv.id;

    -- The access the inviter chose waits for the person.
    if inv.role in ('team', 'agent', 'lawyer') and inv.client_id is null and jsonb_array_length(inv.access) > 0 then
      begin
        insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit)
        select 'grant-' || gen_random_uuid()::text, new_member_id, a.section, a.client_id, a.can_edit
          from jsonb_to_recordset(inv.access) as a(section text, client_id text, can_edit boolean)
          join public.clients c on c.id = a.client_id and c.workspace_id = inv.workspace_id and c.demo_owner is null
         where a.section in ('music', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'legal', 'profile', 'admin')
           and a.can_edit is not null
           and (a.section <> 'admin' or a.can_edit)
         limit 300
        on conflict do nothing;
      exception when others then
        update public.pending_invites set apply_error = left(sqlerrm, 300) where id = inv.id;
      end;
    end if;
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

-- The same team list as before, plus "invited": true until that login has signed in for the first time.
drop function if exists public.workspace_people();
create function public.workspace_people()
returns table (member_id uuid, user_id uuid, label text, role text, all_clients boolean, client_ids text[], invited boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select wm.id, wm.user_id,
         coalesce(nullif(p.name, ''), u.email::text, 'Someone'),
         wm.role,
         (wm.role = 'manager' or exists (
            select 1 from public.access_grants g where g.workspace_member_id = wm.id and g.client_id is null)),
         coalesce((select array_agg(distinct g.client_id) from public.access_grants g
                    where g.workspace_member_id = wm.id and g.client_id is not null), '{}'),
         (u.last_sign_in_at is null)
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    left join public.people p on p.id = wm.person_id
   where wm.client_id is null
     and wm.workspace_id = (select me.workspace_id from public.workspace_members me
                             where me.user_id = auth.uid() and me.client_id is null limit 1)
$$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;
