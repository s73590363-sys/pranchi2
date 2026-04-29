CREATE OR REPLACE FUNCTION public.folder_requires_pin(_folder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _requires_pin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_locked INTO _requires_pin
  FROM public.gallery_folders
  WHERE id = _folder_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN coalesce(_requires_pin, false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.folder_requires_pin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.folder_requires_pin(uuid) TO authenticated;