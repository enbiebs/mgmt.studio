-- Offer terms: everything an offer says beyond venue / date / guarantee - show details
-- (capacity, age, doors, set time), ticket bonuses and travel contributions, merch split,
-- production and hospitality, the payment schedule, the radius clause, routing notes,
-- alternative dates and a "reply by" date. Kept as one JSON document: the form edits it as
-- a whole and nothing queries inside it, so new terms won't need a database change.
-- Access is unchanged (same rules as the rest of tour_offers).
alter table tour_offers add column if not exists terms jsonb;
