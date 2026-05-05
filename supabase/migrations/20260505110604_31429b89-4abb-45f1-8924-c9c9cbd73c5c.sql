
-- Conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('group','dm')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text,
  media_url text,
  media_type text NOT NULL DEFAULT 'text' CHECK (media_type IN ('text','image','video','voice')),
  reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_participants_user ON public.conversation_participants(user_id);

CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE public.typing_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Helper function to check participation (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conv AND user_id = _user
  );
$$;

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

-- conversations policies
CREATE POLICY "Participants can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id, auth.uid()));

CREATE POLICY "Authenticated can create conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- participants policies
CREATE POLICY "Users see participants of own conversations" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can add themselves" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participant row" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can leave conversations" ON public.conversation_participants
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- messages policies
CREATE POLICY "Participants view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Authors update own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authors or admin delete messages" ON public.messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR lower(coalesce(auth.jwt()->>'email','')) = 's73590363@gmail.com');

-- reactions policies
CREATE POLICY "Participants see reactions" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id, auth.uid())));

CREATE POLICY "Participants add reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND public.is_conversation_participant(m.conversation_id, auth.uid())));

CREATE POLICY "Users remove own reactions" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- typing policies
CREATE POLICY "Participants see typing" ON public.typing_indicators
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users insert own typing" ON public.typing_indicators
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own typing" ON public.typing_indicators
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own typing" ON public.typing_indicators
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;

-- Default group room
INSERT INTO public.conversations (id, type, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000001', 'group', 'Alpha Squad', NULL)
ON CONFLICT (id) DO NOTHING;

-- Auto-add new users to the default group
CREATE OR REPLACE FUNCTION public.add_user_to_default_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES ('00000000-0000-0000-0000-000000000001', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_join_default_group ON auth.users;
CREATE TRIGGER on_auth_user_join_default_group
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.add_user_to_default_group();

-- Backfill existing users
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM auth.users
ON CONFLICT DO NOTHING;

-- DM helper: get or create a DM between two users
CREATE OR REPLACE FUNCTION public.get_or_create_dm(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _me = _other_user THEN RAISE EXCEPTION 'Cannot DM yourself'; END IF;

  SELECT c.id INTO _conv
  FROM public.conversations c
  WHERE c.type = 'dm'
    AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _me)
    AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _other_user)
  LIMIT 1;

  IF _conv IS NOT NULL THEN RETURN _conv; END IF;

  INSERT INTO public.conversations (type, created_by) VALUES ('dm', _me) RETURNING id INTO _conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (_conv, _me), (_conv, _other_user);
  RETURN _conv;
END;
$$;

-- Storage bucket for chat media
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Chat media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-media');

CREATE POLICY "Authenticated upload chat media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own chat media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND auth.uid()::text = (storage.foldername(name))[1]);
