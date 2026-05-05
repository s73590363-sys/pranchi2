import { useEffect, useState } from "react";
import { Heart, Send, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CommentRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name?: string | null;
  author_avatar?: string | null;
}

interface Props {
  postId: string;
  variant?: "light" | "dark";
}

const PostInteractions = ({ postId, variant = "dark" }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = isAdminUser(user?.email);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dark = variant === "dark";
  const txt = dark ? "text-white" : "text-foreground";
  const sub = dark ? "text-white/60" : "text-muted-foreground";
  const inputCls = dark
    ? "bg-white/10 border-white/20 text-white placeholder:text-white/50"
    : "bg-secondary border-border text-foreground placeholder:text-muted-foreground";

  // initial fetch + realtime
  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      const [{ count }, { data: myLike }, { data: cs }] = await Promise.all([
        supabase.from("post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
        user
          ? supabase.from("post_likes").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase.from("post_comments").select("id, user_id, content, created_at").eq("post_id", postId).order("created_at", { ascending: true }),
      ]);
      if (!active) return;
      setLikes(count ?? 0);
      setLiked(!!myLike);

      const rows = cs ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      const profileMap = new Map<string, { name: string | null; avatar: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids);
        (profs || []).forEach((p: any) => profileMap.set(p.user_id, { name: p.display_name, avatar: p.avatar_url }));
      }
      if (!active) return;
      setComments(rows.map((r: any) => ({
        ...r,
        author_name: profileMap.get(r.user_id)?.name ?? "Member",
        author_avatar: profileMap.get(r.user_id)?.avatar ?? null,
      })));
    };
    loadAll();

    const channel = supabase
      .channel(`post-${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes", filter: `post_id=eq.${postId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments", filter: `post_id=eq.${postId}` }, () => loadAll())
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [postId, user?.id]);

  const toggleLike = async () => {
    if (!user || busy) return;
    setBusy(true);
    // optimistic
    const willLike = !liked;
    setLiked(willLike);
    setLikes((n) => n + (willLike ? 1 : -1));
    try {
      if (willLike) {
        const { error } = await supabase.from("post_likes").insert({ post_id: postId, user_id: user.id });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
        if (error) throw error;
      }
    } catch (e: any) {
      // revert
      setLiked(!willLike);
      setLikes((n) => n + (willLike ? -1 : 1));
      toast({ title: "Couldn't update like", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    const content = draft.trim();
    if (!content || !user) return;
    if (content.length > 1000) {
      toast({ title: "Comment too long", description: "Max 1000 characters.", variant: "destructive" });
      return;
    }
    setDraft("");
    const { error } = await supabase.from("post_comments").insert({ post_id: postId, user_id: user.id, content });
    if (error) {
      toast({ title: "Couldn't post comment", description: error.message, variant: "destructive" });
      setDraft(content);
    }
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("post_comments").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLike}
          disabled={!user || busy}
          className={`flex items-center gap-1.5 ${txt} transition-transform active:scale-90`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart className={`w-5 h-5 ${liked ? "fill-red-500 text-red-500" : ""}`} />
          <span className="text-sm font-body">{likes}</span>
        </button>
        <span className={`text-xs ${sub} font-body`}>
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </span>
      </div>

      <div className={`max-h-48 overflow-y-auto space-y-2 pr-1`}>
        {comments.length === 0 ? (
          <p className={`text-xs ${sub} font-body`}>Be the first to comment</p>
        ) : (
          comments.map((c) => {
            const canDelete = user && (c.user_id === user.id || isAdmin);
            return (
              <div key={c.id} className={`flex gap-2 items-start text-sm`}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/40 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-display font-bold text-primary-foreground">
                  {c.author_avatar ? (
                    <img src={c.author_avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (c.author_name?.[0] ?? "M").toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`${txt} font-body break-words`}>
                    <span className="font-semibold mr-1">{c.author_name}</span>
                    {c.content}
                  </p>
                  <p className={`text-[10px] ${sub} font-body`}>
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className={`${sub} hover:text-destructive p-1`}
                    aria-label="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {user && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            placeholder="Add a comment..."
            maxLength={1000}
            className={`${inputCls} font-body`}
          />
          <Button onClick={addComment} disabled={!draft.trim()} size="icon" className="bg-foreground text-background hover:bg-foreground/90">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default PostInteractions;
