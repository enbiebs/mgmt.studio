-- A company knows who owns it: the person who created it by signing up. Nothing is enforced with it yet (the owner is
-- shown on the Company page, and later it protects the owner from being removed or demoted and decides who can hand the
-- company over); this just records it, correctly, from the start.
--
-- Also fixes a small gap in sign-up: the company name from the sign-up form was used as typed, so a name made only of
-- spaces would have been refused by the name rule added in migration 058 and broken the sign-up. It is now trimmed first.
alter table public.workspaces add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

-- companies that already exist: the owner is their earliest manager
update public.workspaces w
   set owner_user_id = (select m.user_id from public.workspace_members m
                         where m.workspace_id = w.id and m.role = 'manager' and m.client_id is null
                         order by m.created_at, m.id limit 1)
 where w.owner_user_id is null;

-- the sign-up trigger records the owner when it creates a company
do $patch$
declare def text;
begin
  def := pg_get_functiondef('public.handle_new_user'::regproc);
  def := replace(def,
    E'    insert into public.workspaces (name)\n    values (coalesce(nullif(left(new.raw_user_meta_data->>''workspace_name'', 80), ''''), split_part(new.email, ''@'', 1)))',
    E'    insert into public.workspaces (name, owner_user_id)\n    values (coalesce(nullif(btrim(left(new.raw_user_meta_data->>''workspace_name'', 80)), ''''), left(split_part(new.email, ''@'', 1), 80)), new.id)');
  if position('owner_user_id' in def) = 0 then raise exception 'the sign-up trigger patch did not apply'; end if;
  execute def;
end $patch$;
