-- Housekeeping from the database security check: three access-checking helper functions
-- could be called by signed-out visitors (the `anon` role). They only ever answer "may THIS
-- signed-in person see that?", so nothing leaked, but a signed-out caller has no business with
-- them. Keep them for signed-in users (the row-level-security rules call them as that user).
revoke execute on function public.can_see_travel_item_row(text, text) from public, anon;
grant  execute on function public.can_see_travel_item_row(text, text) to authenticated;

revoke execute on function public.is_artist_of(text) from public, anon;
grant  execute on function public.is_artist_of(text) to authenticated;

revoke execute on function public.has_workspace_legal_template_access(uuid, boolean) from public, anon;
grant  execute on function public.has_workspace_legal_template_access(uuid, boolean) to authenticated;
