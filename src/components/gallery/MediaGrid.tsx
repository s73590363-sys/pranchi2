import { useEffect, useState } from "react";
import { Heart, Trash2, Play, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MediaItem {
  id: string;
  caption: string | null;
  image_url: string | null;
  likes_count: number;
  location: string | null;
  created_at: string;
  media_type: string;
}

interface MediaGridProps {
  items: MediaItem[];
  isAdmin: boolean;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
}

const MediaGrid = ({ items, isAdmin, onSelect, onDelete }: MediaGridProps) => {
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.id);
    let active = true;

    const refresh = async () => {
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from("post_likes").select("post_id").in("post_id", ids),
        supabase.from("post_comments").select("post_id").in("post_id", ids),
      ]);
      if (!active) return;
      const lc: Record<string, number> = {};
      const cc: Record<string, number> = {};
      ids.forEach((id) => { lc[id] = 0; cc[id] = 0; });
      (likes || []).forEach((r: any) => { lc[r.post_id] = (lc[r.post_id] || 0) + 1; });
      (comments || []).forEach((r: any) => { cc[r.post_id] = (cc[r.post_id] || 0) + 1; });
      setLikeCounts(lc);
      setCommentCounts(cc);
    };
    refresh();

    const ch = supabase
      .channel(`grid-${ids.slice(0, 3).join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, refresh)
      .subscribe();

    return () => { active = false; supabase.removeChannel(ch); };
  }, [items.map((i) => i.id).join("|")]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((item, i) => (
        <div key={item.id} className="memory-grid-item group relative glass-card rounded-xl overflow-hidden cursor-pointer">
          <div className="aspect-square" onClick={() => onSelect(i)}>
            {item.media_type === "video" ? (
              <video src={item.image_url!} className="w-full h-full object-cover" muted />
            ) : (
              <img src={item.image_url!} alt={item.caption || ""} className="w-full h-full object-cover transition-transform duration-500" />
            )}

            {item.media_type === "video" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Play className="w-10 h-10 text-white/80 drop-shadow-lg" />
              </div>
            )}

            {isAdmin && (
              <button
                className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="p-2">
            <p className="text-xs font-body text-foreground truncate">{item.caption || "Untitled"}</p>
            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3" />
                  {likeCounts[item.id] ?? item.likes_count}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  {commentCounts[item.id] ?? 0}
                </span>
              </span>
              <span>{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MediaGrid;
