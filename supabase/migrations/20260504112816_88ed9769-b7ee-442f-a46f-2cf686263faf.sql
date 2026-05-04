-- Internal-only trigger function: revoke from public/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.bump_likes_count() FROM PUBLIC, anon, authenticated;

-- handle_new_user is auth trigger only
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- PIN helpers: keep authenticated, revoke anon
REVOKE EXECUTE ON FUNCTION public.folder_requires_pin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.folder_requires_pin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) TO authenticated;