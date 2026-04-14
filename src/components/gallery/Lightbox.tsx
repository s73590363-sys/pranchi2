import { X, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";

interface MediaItem {
  id: string;
  caption: string | null;
  image_url: string | null;
  likes_count: number;
  created_at: string;
  media_type: string;
}

interface LightboxProps {
  items: MediaItem[];
  index: number;
  slideshow: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSlideshow: () => void;
}

const Lightbox = ({ items, index, slideshow, onClose, onPrev, onNext, onToggleSlideshow }: LightboxProps) => {
  const item = items[index];
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm font-body">{index + 1} / {items.length}</span>
          {slideshow && (
            <span className="text-xs text-primary bg-primary/20 px-2 py-0.5 rounded-full font-body">Slideshow</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {slideshow ? (
            <button className="p-2 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); onToggleSlideshow(); }}>
              <Pause className="w-5 h-5" />
            </button>
          ) : items.length > 1 ? (
            <button className="p-2 text-white/70 hover:text-white" onClick={(e) => { e.stopPropagation(); onToggleSlideshow(); }}>
              <Play className="w-5 h-5" />
            </button>
          ) : null}
          <button className="p-2 text-white/70 hover:text-white" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      <button className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white" onClick={(e) => { e.stopPropagation(); onPrev(); }}>
        <ChevronLeft className="w-8 h-8" />
      </button>
      <button className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white" onClick={(e) => { e.stopPropagation(); onNext(); }}>
        <ChevronRight className="w-8 h-8" />
      </button>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center px-16">
        {item.media_type === "video" ? (
          <video
            src={item.image_url!}
            controls
            autoPlay
            className="max-h-[70vh] max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            src={item.image_url!}
            alt={item.caption || ""}
            className="max-h-[70vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Bottom caption */}
      <div className="p-4 text-center">
        <p className="text-white font-body text-sm">{item.caption || "Untitled Memory"}</p>
        <p className="text-white/50 text-xs mt-1">
          {new Date(item.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Progress bar for slideshow */}
      {slideshow && (
        <div className="h-1 bg-white/10">
          <div className="h-full bg-primary animate-slideshow-progress" />
        </div>
      )}
    </div>
  );
};

export default Lightbox;
