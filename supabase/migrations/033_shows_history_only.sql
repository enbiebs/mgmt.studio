-- A show kept only as history: it already happened, we want it for fee comparisons ("what has this
-- artist been paid in this city before?"), but it must never raise to-dos such as "no settlement
-- yet". Set when past dates are imported from a calendar. The shows table's existing access rules
-- already apply.
alter table public.shows
  add column if not exists history_only boolean not null default false;
