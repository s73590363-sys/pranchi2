import { Heart, Trash2, Play } from "lucide-react";

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
              <span className="flex items-center gap-1">
                <Heart className="w-3 h-3" />
                {item.likes_count}
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
