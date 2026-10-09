-- Eli's example budget pays an advance day at its own rate (TM: advance $700,
-- travel $500/day, show $1,000/day), so crew need a third day rate.
-- Blank = same as the travel rate (which itself defaults to the show rate).
alter table crew_rates add column if not exists rate_advance numeric;
