-- Add group profile + wallpaper
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS wallpaper_url text;

-- Helper: is current user the admin?
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 's73590363@gmail.com';
$$;

-- Restrict group creation to admin (DMs still allowed for everyone via get_or_create_dm SECURITY DEFINER)
DROP POLICY IF EXISTS "Authenticated can create conversations" ON public.conversations;
CREATE POLICY "Admin or DM create conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (type = 'dm' OR public.is_app_admin())
);

-- Allow admin to update group profile/wallpaper/name
CREATE POLICY "Admin updates groups"
ON public.conversations FOR UPDATE TO authenticated
USING (public.is_app_admin())
WITH CHECK (public.is_app_admin());

-- Allow admin to delete groups
CREATE POLICY "Admin deletes groups"
ON public.conversations FOR DELETE TO authenticated
USING (public.is_app_admin() AND type = 'group');

-- Participants: admin can add/remove anyone in group conversations.
-- Existing "Users can add themselves" still allows DM auto-join, but for groups we want admin-only.
DROP POLICY IF EXISTS "Users can add themselves" ON public.conversation_participants;
CREATE POLICY "Self-add for DM or admin add anyone"
ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK (
  public.is_app_admin()
  OR (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.conversations c
                WHERE c.id = conversation_id AND c.type = 'dm')
  )
);

DROP POLICY IF EXISTS "Users can leave conversations" ON public.conversation_participants;
CREATE POLICY "Admin remove or self leave"
ON public.conversation_participants FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_app_admin()
);

-- Per-message read receipts
CREATE TABLE IF NOT EXISTS public.message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON public.message_reads(message_id);

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants see read receipts"
ON public.message_reads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reads.message_id
      AND public.is_conversation_participant(m.conversation_id, auth.uid())
  )
);

CREATE POLICY "Users mark own reads"
ON public.message_reads FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reads.message_id
      AND public.is_conversation_participant(m.conversation_id, auth.uid())
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER TABLE public.message_reads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;