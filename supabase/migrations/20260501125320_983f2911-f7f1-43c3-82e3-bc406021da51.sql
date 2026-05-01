-- Force every existing folder to be locked. For folders with no PIN hash, seed a default '0000' PIN so the modal always appears. Owners/admin can change it via the Manage PIN dialog.
UPDATE public.gallery_folders
SET pin_hash = crypt('0000', gen_salt('bf')),
    is_locked = true
WHERE pin_hash IS NULL;

UPDATE public.gallery_folders
SET is_locked = true
WHERE is_locked = false;