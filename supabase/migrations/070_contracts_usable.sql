-- Contracts become usable: they can be added and edited in the app, they can renew by themselves, they carry a notice period and the
-- key terms of the deal, and a copy of the contract itself (PDF or Word) can be kept with them. Everything here is ADDITIVE: new
-- columns with safe defaults and a new private storage bucket; nothing existing changes meaning, and the old app keeps working.
--
-- Who can do what is unchanged and already enforced by the contracts row-level rules (011 and 021: has_section_access(client_id,
-- 'legal') to read, '... true' to change, per-item hiding through can_see_item). The files live in a PRIVATE bucket with no storage
-- policies on purpose (default-deny for everyone but our server routes, which check access first), the same posture as bills.
alter table contracts add column if not exists auto_renews    boolean not null default false;
alter table contracts add column if not exists renewal_months integer check (renewal_months is null or renewal_months between 1 and 120);
alter table contracts add column if not exists notice_days    integer check (notice_days is null or notice_days between 0 and 1000);
alter table contracts add column if not exists terms          jsonb   not null default '{}'::jsonb check (jsonb_typeof(terms) = 'object');
alter table contracts add column if not exists files          jsonb   not null default '[]'::jsonb check (jsonb_typeof(files) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 20971520, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf', 'text/rtf'
])
on conflict (id) do nothing;
