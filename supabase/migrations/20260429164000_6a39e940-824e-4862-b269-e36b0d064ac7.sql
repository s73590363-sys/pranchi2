CREATE OR REPLACE FUNCTION public.folder_requires_pin(_folder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _requires_pin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (pin_hash IS NOT NULL OR is_locked IS TRUE) INTO _requires_pin
  FROM public.gallery_folders
  WHERE id = _folder_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN _requires_pin;
END;
$function$;

REVOKE SELECT ON TABLE public.gallery_folders FROM anon, authenticated;
GRANT SELECT (id, name, cover_image_url, created_by, created_at, is_locked) ON TABLE public.gallery_folders TO authenticated;

REVOKE EXECUTE ON FUNCTION public.folder_requires_pin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.folder_requires_pin(uuid) TO authenticated;