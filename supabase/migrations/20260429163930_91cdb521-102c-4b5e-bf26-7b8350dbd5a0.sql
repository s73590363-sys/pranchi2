CREATE OR REPLACE FUNCTION public.set_folder_pin(_folder_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
  _request_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT created_by INTO _owner
  FROM public.gallery_folders
  WHERE id = _folder_id;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Folder not found';
  END IF;

  _request_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF _owner <> auth.uid() AND _request_email <> 's73590363@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _pin IS NULL OR length(_pin) = 0 THEN
    UPDATE public.gallery_folders
      SET pin_hash = NULL, is_locked = false
      WHERE id = _folder_id;
  ELSE
    IF _pin !~ '^\d{4}$' THEN
      RAISE EXCEPTION 'PIN must be exactly 4 digits';
    END IF;

    UPDATE public.gallery_folders
      SET pin_hash = crypt(_pin, gen_salt('bf')), is_locked = true
      WHERE id = _folder_id;
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_folder_pin(_folder_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _hash text;
  _locked boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pin_hash, is_locked INTO _hash, _locked
  FROM public.gallery_folders
  WHERE id = _folder_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _hash IS NULL AND _locked IS NOT TRUE THEN
    RETURN true;
  END IF;

  IF _hash IS NULL THEN
    RETURN false;
  END IF;

  IF _pin IS NULL OR _pin !~ '^\d{4}$' THEN
    RETURN false;
  END IF;

  RETURN _hash = crypt(_pin, _hash);
END;
$function$;

UPDATE public.gallery_folders
SET is_locked = (pin_hash IS NOT NULL)
WHERE is_locked IS DISTINCT FROM (pin_hash IS NOT NULL);

REVOKE EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.verify_folder_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_folder_pin(uuid, text) TO authenticated;