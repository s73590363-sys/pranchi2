CREATE OR REPLACE FUNCTION public.verify_folder_pin(_folder_id uuid, _pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hash TEXT;
  _locked BOOLEAN;
BEGIN
  -- Require an authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pin_hash, is_locked INTO _hash, _locked
  FROM public.gallery_folders
  WHERE id = _folder_id;

  -- Folder doesn't exist
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Folder isn't locked / has no PIN — open access
  IF _locked IS NOT TRUE OR _hash IS NULL THEN
    RETURN true;
  END IF;

  -- Reject empty / malformed PIN attempts immediately
  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RETURN false;
  END IF;

  -- Constant-time bcrypt comparison: only the exact PIN set by the creator unlocks
  RETURN _hash = crypt(_pin, _hash);
END;
$function$;