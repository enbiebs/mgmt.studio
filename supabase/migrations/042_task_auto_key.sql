-- Key dates ("send the advance by ...") are worked out by the app and shown on Today as up-for-grabs rows.
-- When someone takes one it becomes a real to-do carrying an `auto_key` such as "advance:<show id>", so the
-- same key date can never be taken twice (a unique rule per artist) and never comes back as a second copy.
alter table public.tasks add column if not exists auto_key text
  check (auto_key is null or char_length(auto_key) <= 120);
create unique index if not exists tasks_auto_key_unique on public.tasks (client_id, auto_key) where auto_key is not null;

-- 'auto' = created by taking a key date (the other sources are unchanged).
alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('manual', 'command_bar', 'agent', 'auto'));
