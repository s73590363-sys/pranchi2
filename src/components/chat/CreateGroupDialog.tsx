import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";

interface Props {
  onCreated: (id: string) => void;
}

const CreateGroupDialog = ({ onCreated }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [users, setUsers] = useState<{ user_id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    supabase.from("profiles").select("user_id, display_name, avatar_url")
      .neq("user_id", user.id).then(({ data }) => setUsers(data ?? []));
  }, [open, user?.id]);

  const create = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { data: conv, error } = await supabase.from("conversations")
      .insert({ type: "group", name: name.trim(), created_by: user.id })
      .select("id").single();
    if (error || !conv) {
      setSaving(false);
      toast({ title: "Create failed", description: error?.message, variant: "destructive" });
      return;
    }
    const rows = [user.id, ...selected].map((uid) => ({ conversation_id: conv.id, user_id: uid }));
    await supabase.from("conversation_participants").insert(rows);
    setSaving(false);
    setOpen(false); setName(""); setSelected(new Set());
    onCreated(conv.id);
    toast({ title: "Group created" });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Create group"><Users className="w-4 h-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create group</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Group name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My new group" />
          </div>
          <div>
            <Label>Add members</Label>
            <div className="max-h-64 overflow-y-auto space-y-1 mt-1">
              {users.map((u) => (
                <label key={u.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary cursor-pointer">
                  <Checkbox checked={selected.has(u.user_id)} onCheckedChange={(v) => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (v) n.add(u.user_id); else n.delete(u.user_id);
                      return n;
                    });
                  }} />
                  <Avatar className="w-7 h-7">
                    {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                    <AvatarFallback>{(u.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{u.display_name ?? "Member"}</span>
                </label>
              ))}
            </div>
          </div>
          <Button onClick={create} disabled={saving || !name.trim()} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupDialog;
