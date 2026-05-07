import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, UserPlus, Image as ImageIcon } from "lucide-react";
import { isAdminUser } from "@/lib/admin";

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface Member { user_id: string; display_name: string | null; avatar_url: string | null; }

const GroupSettings = ({ conversationId, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = isAdminUser(user?.email);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: c } = await supabase
      .from("conversations").select("name, avatar_url, wallpaper_url").eq("id", conversationId).maybeSingle();
    if (c) { setName(c.name ?? ""); setAvatarUrl(c.avatar_url); setWallpaperUrl(c.wallpaper_url); }

    const { data: parts } = await supabase
      .from("conversation_participants").select("user_id").eq("conversation_id", conversationId);
    const ids = (parts ?? []).map((p) => p.user_id);
    const { data: profs } = await supabase
      .from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids.length ? ids : ["x"]);
    setMembers(profs ?? []);

    const { data: all } = await supabase
      .from("profiles").select("user_id, display_name, avatar_url");
    setAllUsers((all ?? []).filter((p) => !ids.includes(p.user_id)));
  };

  useEffect(() => { if (open) load(); }, [open, conversationId]);

  const uploadFile = async (file: File, kind: "avatar" | "wallpaper") => {
    if (!user) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    // Stable path keyed by group + kind so URL never changes across updates
    const path = `${user.id}/group-${conversationId}/${kind}.${ext}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    // Cache-bust the rendered URL while the storage path itself stays stable
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const patch = kind === "avatar" ? { avatar_url: url } : { wallpaper_url: url };
    const { error: uErr } = await supabase.from("conversations").update(patch).eq("id", conversationId);
    if (uErr) { toast({ title: "Update failed", description: uErr.message, variant: "destructive" }); return; }
    if (kind === "avatar") setAvatarUrl(url); else setWallpaperUrl(url);
    toast({ title: `${kind === "avatar" ? "Profile" : "Wallpaper"} updated` });
  };

  const saveName = async () => {
    setSaving(true);
    const { error } = await supabase.from("conversations").update({ name }).eq("id", conversationId);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Group name updated" });
  };

  const addMember = async (uid: string) => {
    const { error } = await supabase.from("conversation_participants")
      .insert({ conversation_id: conversationId, user_id: uid });
    if (error) toast({ title: "Add failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Member added" }); load(); }
  };

  const removeMember = async (uid: string) => {
    const { error } = await supabase.from("conversation_participants")
      .delete().eq("conversation_id", conversationId).eq("user_id", uid);
    if (error) toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Member removed" }); load(); }
  };

  const filtered = allUsers.filter((u) => (u.display_name ?? "").toLowerCase().includes(search.toLowerCase()));

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Group settings</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-16 h-16">
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback>{name.slice(0, 2).toUpperCase() || "GR"}</AvatarFallback>
            </Avatar>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild><span><ImageIcon className="w-4 h-4 mr-2" />Change profile</span></Button>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "avatar")} />
            </label>
          </div>

          <div>
            <Label>Group name</Label>
            <div className="flex gap-2 mt-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button onClick={saveName} disabled={saving}>Save</Button>
            </div>
          </div>

          <div>
            <Label>Wallpaper</Label>
            <div className="mt-1 flex items-center gap-3">
              {wallpaperUrl ? (
                <img src={wallpaperUrl} alt="wallpaper" className="w-24 h-16 object-cover rounded" />
              ) : (
                <div className="w-24 h-16 bg-secondary rounded" />
              )}
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild><span><ImageIcon className="w-4 h-4 mr-2" />Upload wallpaper</span></Button>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "wallpaper")} />
              </label>
              {wallpaperUrl && (
                <Button variant="ghost" size="sm" onClick={async () => {
                  await supabase.from("conversations").update({ wallpaper_url: null }).eq("id", conversationId);
                  setWallpaperUrl(null);
                }}>Remove</Button>
              )}
            </div>
          </div>

          <div>
            <Label>Members ({members.length})</Label>
            <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary">
                  <Avatar className="w-8 h-8">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{(m.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm">{m.display_name ?? "Member"}</span>
                  {m.user_id !== user?.id && (
                    <Button size="icon" variant="ghost" onClick={() => removeMember(m.user_id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Add member</Label>
            <Input placeholder="Search users" value={search} onChange={(e) => setSearch(e.target.value)} className="mt-1" />
            <div className="space-y-1 mt-2 max-h-48 overflow-y-auto">
              {filtered.map((u) => (
                <button key={u.user_id} onClick={() => addMember(u.user_id)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-secondary text-left">
                  <Avatar className="w-8 h-8">
                    {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                    <AvatarFallback>{(u.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm">{u.display_name ?? "Member"}</span>
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
              {!filtered.length && <p className="text-xs text-muted-foreground p-2">No more users to add.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GroupSettings;
