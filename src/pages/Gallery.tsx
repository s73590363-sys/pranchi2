import { useState, useRef, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Loader2, Plus, Play, Image as ImageIcon, ArrowLeft, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import FolderList from "@/components/gallery/FolderList";
import MediaGrid from "@/components/gallery/MediaGrid";
import Lightbox from "@/components/gallery/Lightbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const ADMIN_EMAIL = "s73590363@gmail.com";
const SLIDESHOW_INTERVAL = 4000;

const Gallery = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [lightbox, setLightbox] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPin, setNewFolderPin] = useState("");
  const [pinPromptFolder, setPinPromptFolder] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unlockedFolders, setUnlockedFolders] = useState<Set<string>>(new Set());
  const [pinManageFolder, setPinManageFolder] = useState<string | null>(null);
  const [managePin, setManagePin] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch folders
  const { data: folders = [] } = useQuery({
    queryKey: ["gallery-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gallery_folders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch media for active folder (or root = no folder)
  const { data: media = [], isLoading } = useQuery({
    queryKey: ["gallery-media", activeFolder],
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id, caption, image_url, likes_count, location, created_at, media_type, folder_id")
        .not("image_url", "is", null)
        .order("created_at", { ascending: false });

      if (activeFolder) {
        query = query.eq("folder_id", activeFolder);
      } else {
        // Strict separation: root only shows media with no folder
        query = query.is("folder_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Slideshow
  const nextSlide = useCallback(() => {
    setLightbox((prev) => {
      if (prev === null) return 0;
      return prev >= media.length - 1 ? 0 : prev + 1;
    });
  }, [media.length]);

  useEffect(() => {
    if (slideshow && lightbox !== null) {
      slideshowRef.current = setInterval(nextSlide, SLIDESHOW_INTERVAL);
    }
    return () => { if (slideshowRef.current) clearInterval(slideshowRef.current); };
  }, [slideshow, lightbox, nextSlide]);

  const startSlideshow = () => { setLightbox(0); setSlideshow(true); };
  const stopSlideshow = () => { setSlideshow(false); if (slideshowRef.current) clearInterval(slideshowRef.current); };
  const closeLightbox = () => { setLightbox(null); stopSlideshow(); };

  // Create folder (with optional PIN)
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    const pin = newFolderPin.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      toast({ title: "PIN must be 4 digits", variant: "destructive" });
      return;
    }
    const { data: folder, error } = await supabase
      .from("gallery_folders")
      .insert({ name: newFolderName.trim(), created_by: user.id })
      .select()
      .single();
    if (error || !folder) {
      toast({ title: "Failed to create folder", description: error?.message, variant: "destructive" });
      return;
    }
    if (pin) {
      const { error: pinErr } = await supabase.rpc("set_folder_pin", { _folder_id: folder.id, _pin: pin });
      if (pinErr) {
        toast({ title: "Folder created but PIN failed", description: pinErr.message, variant: "destructive" });
      }
    }
    toast({ title: `Folder "${newFolderName.trim()}" created${pin ? " with PIN lock" : ""}` });
    setNewFolderName("");
    setNewFolderPin("");
    setFolderDialog(false);
    queryClient.invalidateQueries({ queryKey: ["gallery-folders"] });
  };

  // Manage PIN on existing folder (set / change / clear)
  const handleSavePin = async () => {
    if (!pinManageFolder) return;
    const pin = managePin.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      toast({ title: "PIN must be 4 digits (or empty to remove)", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("set_folder_pin", { _folder_id: pinManageFolder, _pin: pin || null });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: pin ? "PIN updated" : "PIN removed" });
    setPinManageFolder(null);
    setManagePin("");
    queryClient.invalidateQueries({ queryKey: ["gallery-folders"] });
  };

  // Open folder (prompts for PIN if locked)
  const handleSelectFolder = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder?.is_locked && !unlockedFolders.has(folderId)) {
      setPinPromptFolder(folderId);
      setPinInput("");
      return;
    }
    setActiveFolder(folderId);
  };

  // Verify PIN
  const handleVerifyPin = async () => {
    if (!pinPromptFolder) return;
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_folder_pin", { _folder_id: pinPromptFolder, _pin: pinInput });
    setVerifying(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (!data) { toast({ title: "Incorrect PIN", variant: "destructive" }); return; }
    setUnlockedFolders((prev) => new Set(prev).add(pinPromptFolder));
    setActiveFolder(pinPromptFolder);
    setPinPromptFolder(null);
    setPinInput("");
  };

  // Delete folder
  const handleDeleteFolder = async (folderId: string) => {
    const { error } = await supabase.from("gallery_folders").delete().eq("id", folderId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    if (activeFolder === folderId) setActiveFolder(null);
    toast({ title: "Folder deleted" });
    queryClient.invalidateQueries({ queryKey: ["gallery-folders"] });
  };

  // Delete media
  const handleDeleteMedia = async (postId: string) => {
    const post = media.find((m) => m.id === postId);
    if (post?.image_url) {
      const path = post.image_url.split("/post-images/")[1];
      if (path) await supabase.storage.from("post-images").remove([path]);
    }
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    queryClient.invalidateQueries({ queryKey: ["gallery-media"] });
  };

  // Upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("post-images").upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(path);

        const { error: postError } = await supabase.from("posts").insert({
          user_id: user.id,
          image_url: urlData.publicUrl,
          caption: file.name.replace(/\.[^/.]+$/, ""),
          media_type: isVideo ? "video" : "image",
          folder_id: activeFolder,
        });
        if (postError) throw postError;
      }
      toast({ title: "Uploaded successfully!" });
      queryClient.invalidateQueries({ queryKey: ["gallery-media"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const activeFolderName = activeFolder ? folders.find((f) => f.id === activeFolder)?.name : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            {activeFolder && (
              <button onClick={() => setActiveFolder(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">{activeFolderName || "Album"}</h1>
              <p className="text-sm text-muted-foreground font-body">{media.length} {media.length === 1 ? "item" : "items"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {media.length > 1 && (
              <Button variant="outline" size="sm" onClick={startSlideshow} className="gap-2">
                <Play className="w-4 h-4" />
                Slideshow
              </Button>
            )}
            {isAdmin && (
              <>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-foreground text-background hover:bg-foreground/90 font-display gap-2">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</> : <><Plus className="w-4 h-4" /> Upload</>}
                </Button>
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleUpload} />
              </>
            )}
          </div>
        </div>

        {/* Folders (only on root view) */}
        {!activeFolder && (
          <FolderList
            folders={folders}
            isAdmin={isAdmin}
            onSelect={handleSelectFolder}
            onCreate={() => setFolderDialog(true)}
            onDelete={handleDeleteFolder}
            onManagePin={(id) => { setPinManageFolder(id); setManagePin(""); }}
          />
        )}

        {/* Media Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className={`p-6 rounded-2xl bg-secondary mb-4 ${isAdmin ? "cursor-pointer hover:bg-secondary/80 transition-colors" : ""}`}
              onClick={() => isAdmin && fileInputRef.current?.click()}
            >
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-display font-semibold text-foreground">No memories yet</h3>
            <p className="text-sm text-muted-foreground font-body mt-1">
              {activeFolder ? "This folder is empty" : "The album is empty"}
            </p>
          </div>
        ) : (
          <MediaGrid
            items={media}
            isAdmin={isAdmin}
            onSelect={(i) => { setLightbox(i); setSlideshow(false); }}
            onDelete={handleDeleteMedia}
          />
        )}
      </main>
      <Footer />

      {/* Lightbox */}
      {lightbox !== null && media[lightbox] && (
        <Lightbox
          items={media}
          index={lightbox}
          slideshow={slideshow}
          onClose={closeLightbox}
          onPrev={() => { stopSlideshow(); setLightbox(Math.max(0, lightbox - 1)); }}
          onNext={() => { stopSlideshow(); setLightbox(Math.min(media.length - 1, lightbox + 1)); }}
          onToggleSlideshow={() => slideshow ? stopSlideshow() : setSlideshow(true)}
        />
      )}

      {/* Create Folder Dialog */}
      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent className="glass-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display">New Folder</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-body"
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
          />
          <DialogFooter>
            <Button onClick={handleCreateFolder} className="bg-foreground text-background hover:bg-foreground/90 font-display">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Gallery;
