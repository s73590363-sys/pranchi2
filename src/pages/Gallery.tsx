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

import { ADMIN_EMAIL } from "@/lib/admin";
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
  const [pinManageFolder, setPinManageFolder] = useState<string | null>(null);
  const [managePin, setManagePin] = useState("");
  const [createPinError, setCreatePinError] = useState<string | null>(null);
  const [managePinError, setManagePinError] = useState<string | null>(null);
  const [verifyPinError, setVerifyPinError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch folders
  const { data: folders = [] } = useQuery({
    queryKey: ["gallery-folders"],
    queryFn: async () => {
      const { data: folderRows, error } = await supabase
        .from("gallery_folders")
        .select("id, name, cover_image_url, created_by, created_at, is_locked")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!folderRows || folderRows.length === 0) return [];

      // Fetch the most recent image for each folder to use as a preview
      const ids = folderRows.map((f) => f.id);
      const { data: previewPosts } = await supabase
        .from("posts")
        .select("folder_id, image_url, media_type, created_at")
        .in("folder_id", ids)
        .not("image_url", "is", null)
        .eq("media_type", "image")
        .order("created_at", { ascending: false });

      const previewMap = new Map<string, string>();
      (previewPosts || []).forEach((p: any) => {
        if (p.folder_id && !previewMap.has(p.folder_id) && p.image_url) {
          previewMap.set(p.folder_id, p.image_url);
        }
      });

      return folderRows.map((f) => ({
        ...f,
        preview_image_url: f.cover_image_url || previewMap.get(f.id) || null,
      }));
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

  // Create folder (PIN is REQUIRED — every folder must be locked)
  const handleCreateFolder = async () => {
    if (!user) return;
    if (!newFolderName.trim()) {
      setCreatePinError("Folder name is required.");
      return;
    }
    const pin = newFolderPin.trim();
    if (pin.length === 0) {
      setCreatePinError("PIN is required to lock this folder.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setCreatePinError("PIN must be exactly 4 digits.");
      return;
    }
    setCreatePinError(null);
    const { data: folder, error } = await supabase
      .from("gallery_folders")
      .insert({ name: newFolderName.trim(), created_by: user.id })
      .select("id, name, cover_image_url, created_by, created_at, is_locked")
      .single();
    if (error || !folder) {
      toast({ title: "Failed to create folder", description: error?.message, variant: "destructive" });
      return;
    }
    const { error: pinErr } = await supabase.rpc("set_folder_pin", { _folder_id: folder.id, _pin: pin });
    if (pinErr) {
      toast({ title: "Folder created but PIN failed", description: pinErr.message, variant: "destructive" });
    } else {
      toast({ title: `Folder "${newFolderName.trim()}" created with PIN lock` });
    }
    setNewFolderName("");
    setNewFolderPin("");
    setFolderDialog(false);
    queryClient.invalidateQueries({ queryKey: ["gallery-folders"] });
  };

  // Open Manage PIN dialog — restricted to folder creator or admin
  const handleOpenManagePin = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const allowed = isAdmin || folder.created_by === user?.id;
    if (!allowed) {
      toast({ title: "Not authorized", description: "Only the folder creator or admin can change this PIN.", variant: "destructive" });
      return;
    }
    setPinManageFolder(folderId);
    setManagePin("");
    setManagePinError(null);
  };

  // Manage PIN on existing folder (PIN required — cannot remove)
  const handleSavePin = async () => {
    if (!pinManageFolder) return;
    const folder = folders.find((f) => f.id === pinManageFolder);
    const allowed = isAdmin || folder?.created_by === user?.id;
    if (!allowed) {
      setManagePinError("You are not authorized to change this folder's PIN.");
      return;
    }
    const pin = managePin.trim();
    if (pin.length === 0) {
      setManagePinError("PIN is required. Folders must stay locked.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setManagePinError("PIN must be exactly 4 digits.");
      return;
    }
    setManagePinError(null);
    const { error } = await supabase.rpc("set_folder_pin", { _folder_id: pinManageFolder, _pin: pin });
    if (error) { setManagePinError(error.message); return; }
    toast({ title: "PIN updated" });
    setPinManageFolder(null);
    setManagePin("");
    queryClient.invalidateQueries({ queryKey: ["gallery-folders"] });
  };

  // Open folder (always prompts for PIN if locked — every time, for everyone)
  const handleSelectFolder = async (folderId: string) => {
    const { data: requiresPin, error } = await (supabase.rpc as any)("folder_requires_pin", { _folder_id: folderId });
    if (error) {
      toast({ title: "Unable to open folder", description: error.message, variant: "destructive" });
      return;
    }

    if (requiresPin) {
      setPinPromptFolder(folderId);
      setPinInput("");
      setVerifyPinError(null);
      return;
    }
    setActiveFolder(folderId);
  };

  // Verify PIN
  const handleVerifyPin = async () => {
    if (!pinPromptFolder) return;
    if (!/^\d{4}$/.test(pinInput)) {
      setVerifyPinError("Enter the 4-digit PIN.");
      return;
    }
    setVerifyPinError(null);
    setVerifying(true);
    const { data, error } = await supabase.rpc("verify_folder_pin", { _folder_id: pinPromptFolder, _pin: pinInput });
    setVerifying(false);
    if (error) { setVerifyPinError(error.message); return; }
    if (!data) { setVerifyPinError("Incorrect PIN. Please try again."); return; }
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
            currentUserId={user?.id}
            onSelect={handleSelectFolder}
            onCreate={() => { setFolderDialog(true); setCreatePinError(null); }}
            onDelete={handleDeleteFolder}
            onManagePin={handleOpenManagePin}
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
      <Dialog open={folderDialog} onOpenChange={(o) => { setFolderDialog(o); if (!o) setCreatePinError(null); }}>
        <DialogContent className="glass-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display">New Folder</DialogTitle>
            <DialogDescription className="font-body">A 4-digit PIN is required to lock this folder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); if (createPinError) setCreatePinError(null); }}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-body"
            />
            <Input
              placeholder="4-digit PIN (required)"
              value={newFolderPin}
              onChange={(e) => { setNewFolderPin(e.target.value.replace(/\D/g, "").slice(0, 4)); if (createPinError) setCreatePinError(null); }}
              inputMode="numeric"
              maxLength={4}
              aria-invalid={!!createPinError}
              className={`bg-secondary border-border text-foreground placeholder:text-muted-foreground font-body tracking-widest ${createPinError ? "border-destructive focus-visible:ring-destructive" : ""}`}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
            {createPinError && (
              <p className="text-sm text-destructive font-body" role="alert">{createPinError}</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCreateFolder} className="bg-foreground text-background hover:bg-foreground/90 font-display">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIN Prompt Dialog (unlock) */}
      <Dialog open={!!pinPromptFolder} onOpenChange={(o) => { if (!o) { setPinPromptFolder(null); setVerifyPinError(null); } }}>
        <DialogContent className="glass-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Lock className="w-4 h-4" /> Enter PIN
            </DialogTitle>
            <DialogDescription className="font-body">This folder is locked. Enter the 4-digit PIN to open it.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="••••"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); if (verifyPinError) setVerifyPinError(null); }}
            inputMode="numeric"
            maxLength={4}
            aria-invalid={!!verifyPinError}
            className={`bg-secondary border-border text-foreground text-center text-2xl tracking-[0.5em] font-body ${verifyPinError ? "border-destructive focus-visible:ring-destructive" : ""}`}
            onKeyDown={(e) => e.key === "Enter" && pinInput.length === 4 && handleVerifyPin()}
          />
          {verifyPinError && (
            <p className="text-sm text-destructive font-body text-center" role="alert">{verifyPinError}</p>
          )}
          <DialogFooter>
            <Button
              onClick={handleVerifyPin}
              disabled={pinInput.length !== 4 || verifying}
              className="bg-foreground text-background hover:bg-foreground/90 font-display"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage PIN Dialog (creator or admin only) */}
      <Dialog open={!!pinManageFolder} onOpenChange={(o) => { if (!o) { setPinManageFolder(null); setManagePinError(null); } }}>
        <DialogContent className="glass-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Folder PIN
            </DialogTitle>
            <DialogDescription className="font-body">
              Set a 4-digit PIN. Folders must remain locked. Only the folder creator or admin can change this.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="4-digit PIN (required)"
            value={managePin}
            onChange={(e) => { setManagePin(e.target.value.replace(/\D/g, "").slice(0, 4)); if (managePinError) setManagePinError(null); }}
            inputMode="numeric"
            maxLength={4}
            aria-invalid={!!managePinError}
            className={`bg-secondary border-border text-foreground text-center text-2xl tracking-[0.5em] font-body ${managePinError ? "border-destructive focus-visible:ring-destructive" : ""}`}
            onKeyDown={(e) => e.key === "Enter" && handleSavePin()}
          />
          {managePinError && (
            <p className="text-sm text-destructive font-body text-center" role="alert">{managePinError}</p>
          )}
          <DialogFooter>
            <Button onClick={handleSavePin} className="bg-foreground text-background hover:bg-foreground/90 font-display">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Gallery;
