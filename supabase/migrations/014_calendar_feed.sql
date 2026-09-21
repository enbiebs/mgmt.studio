-- ─────────────────────────────────────────────────────────────
-- Studio · Calendar feed (live .ics subscription per client)
--
-- Adds a private, unguessable token per client. The manager can enable
-- a feed from the Tour page; anyone with the resulting URL
-- (/api/calendar/[token]) can read that client's show dates — read-only,
-- no further auth, same security model as Google Calendar's own
-- "secret address in iCal format." The route itself is unauthenticated
-- (see middleware.ts bypass), so it looks the token up with the
-- service-role client rather than through a user session.
-- ─────────────────────────────────────────────────────────────

alter table clients add column if not exists calendar_token text unique;
