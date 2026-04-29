REVOKE EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) TO authenticated;