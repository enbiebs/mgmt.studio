-- 062: how much of a show's fee has actually been received (Finance Stage 5b, the cash forecast).
-- ADDITIVE: one new column on show_deals. It lives beside the fee on purpose, so only people with the Deals & fees page can
-- read or change it (the same rules already on show_deals), and an empty value means "nothing recorded as received yet".
alter table public.show_deals
  add column if not exists received numeric check (received is null or received >= 0);
