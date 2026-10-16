-- 063: a budget's assumptions (how many people travel, from where, how many nights, and the flight / hotel / ground
-- estimates behind the travel lines). ADDITIVE: one nullable column on budgets. It is covered by the budget table's own
-- row-level rules, so only people with Finance access to the artist can read or change it.
alter table public.budgets add column if not exists assumptions jsonb;
