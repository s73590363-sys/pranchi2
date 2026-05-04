-- post_likes table
CREATE TABLE public.post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_post_likes_post ON public.post_likes(post_id);
CREATE INDEX idx_post_likes_user ON public.post_likes(user_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes viewable by authenticated"
  ON public.post_likes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can like as themselves"
  ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike own"
  ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- post_comments table
CREATE TABLE public.post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_comments_post ON public.post_comments(post_id, created_at);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by authenticated"
  ON public.post_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can comment as themselves"
  ON public.post_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.post_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR lower(coalesce((auth.jwt() ->> 'email'), '')) = 's73590363@gmail.com');

-- Maintain posts.likes_count
CREATE OR REPLACE FUNCTION public.bump_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_likes_count_ins
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_likes_count();

CREATE TRIGGER trg_post_likes_count_del
AFTER DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.bump_likes_count();

-- Allow admin to delete any post
CREATE POLICY "Admin can delete any post"
  ON public.posts FOR DELETE TO authenticated
  USING (lower(coalesce((auth.jwt() ->> 'email'), '')) = 's73590363@gmail.com');

-- Realtime
ALTER TABLE public.post_likes REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;