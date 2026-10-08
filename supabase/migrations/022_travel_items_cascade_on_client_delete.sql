-- Migration 016 gave travel_items its own client_id (travel no longer requires a
-- show) but the foreign key was created without "on delete cascade", unlike every
-- other table hanging off a client. Result: removing any client that has travel
-- items failed with a foreign-key error. Make it cascade like the rest.
alter table travel_items drop constraint if exists travel_items_client_id_fkey;
alter table travel_items
  add constraint travel_items_client_id_fkey
  foreign key (client_id) references clients(id) on delete cascade;
