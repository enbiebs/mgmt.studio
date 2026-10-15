-- The team list now also says which directory person (the card on the Team page) each login belongs to, so the Team
-- page can show, for every person: no login yet / invited and waiting / has access. Same rules as before: only people
-- on the management side of the caller's own workspace are listed, and only to someone on that side.
drop function if exists public.workspace_people();
create function public.workspace_people()
returns table (member_id uuid, user_id uuid, label text, role text, all_clients boolean, client_ids text[], invited boolean, person_id text)
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
         (u.last_sign_in_at is null),
         wm.person_id
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    left join public.people p on p.id = wm.person_id
   where wm.client_id is null
     and wm.workspace_id = (select me.workspace_id from public.workspace_members me
                             where me.user_id = auth.uid() and me.client_id is null limit 1)
$$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;
