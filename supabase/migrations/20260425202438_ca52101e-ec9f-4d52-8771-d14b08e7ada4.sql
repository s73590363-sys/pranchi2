-- Add pin lock fields to gallery_folders
ALTER TABLE public.gallery_folders
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

-- Enable pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function: set or clear a folder PIN (only the folder creator can do this)
CREATE OR REPLACE FUNCTION public.set_folder_pin(_folder_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  SELECT created_by INTO _owner FROM public.gallery_folders WHERE id = _folder_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'Folder not found';
  END IF;
  IF _owner <> auth.uid() THEN
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
$$;

-- Function: verify a PIN for a folder (any authenticated user can attempt)
CREATE OR REPLACE FUNCTION public.verify_folder_pin(_folder_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash TEXT;
BEGIN
  SELECT pin_hash INTO _hash FROM public.gallery_folders WHERE id = _folder_id;
  IF _hash IS NULL THEN
    RETURN true;
  END IF;
  RETURN _hash = crypt(_pin, _hash);
END;
$$;