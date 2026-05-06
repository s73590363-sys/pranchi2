import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { isAdminUser } from "@/lib/admin";
import CreateGroupDialog from "./CreateGroupDialog";

const DEFAULT_GROUP_ID = "00000000-0000-0000-0000-000000000001";

interface ConvRow {
  id: string;
  type: "group" | "dm";
  name: string | null;
  avatar_url?: string | null;
  other?: { user_id: string; display_name: string | null; avatar_url: string | null } | null;
  lastMessage?: string | null;
  lastAt?: string | null;
}

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
}

const ConversationList = ({ activeId, onSelect }: Props) => {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.email);
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!user) return;
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const ids = (parts ?? []).map((p) => p.conversation_id);
    if (ids.length === 0) { setConvs([]); return; }

    const { data: cs } = await supabase
      .from("conversations")
      .select("id, type, name, avatar_url")
      .in("id", ids);

    // For DMs, fetch other participant
    const dmIds = (cs ?? []).filter((c) => c.type === "dm").map((c) => c.id);
    let dmOthers: Record<string, any> = {};
    if (dmIds.length) {
      const { data: dmParts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", dmIds)
        .neq("user_id", user.id);
      const otherIds = [...new Set((dmParts ?? []).map((p) => p.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", otherIds.length ? otherIds : ["00000000-0000-0000-0000-000000000000"]);
      const profMap = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p]));
      (dmParts ?? []).forEach((p) => { dmOthers[p.conversation_id] = profMap[p.user_id]; });
    }

    // Last message preview
    const { data: lastMsgs } = await supabase
      .from("messages")
      .select("conversation_id, content, media_type, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    const lastMap: Record<string, any> = {};
    (lastMsgs ?? []).forEach((m) => {
      if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m;
    });

    const rows: ConvRow[] = (cs ?? []).map((c: any) => ({
      id: c.id,
      type: c.type as "group" | "dm",
      name: c.name,
      avatar_url: c.avatar_url,
      other: c.type === "dm" ? dmOthers[c.id] ?? null : null,
      lastMessage: lastMap[c.id]?.media_type === "text"
        ? lastMap[c.id]?.content
        : lastMap[c.id]?.media_type ? `📎 ${lastMap[c.id].media_type}` : null,
      lastAt: lastMap[c.id]?.created_at ?? null,
    }));
    rows.sort((a, b) => {
      if (a.id === DEFAULT_GROUP_ID) return -1;
      if (b.id === DEFAULT_GROUP_ID) return 1;
      return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    });
    setConvs(rows);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const openMembersDialog = async () => {
    setNewDmOpen(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .neq("user_id", user!.id);
    setMembers(data ?? []);
  };

  const startDm = async (otherUserId: string) => {
    const { data, error } = await supabase.rpc("get_or_create_dm", { _other_user: otherUserId });
    if (!error && data) {
      setNewDmOpen(false);
      onSelect(data as string);
      load();
    }
  };

  const filtered = members.filter((m) =>
    (m.display_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="font-display font-semibold text-lg">Chats</h2>
        <div className="flex items-center gap-1">
          {isAdmin && <CreateGroupDialog onCreated={(id) => onSelect(id)} />}
          <Dialog open={newDmOpen} onOpenChange={setNewDmOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" onClick={openMembersDialog} aria-label="New chat">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Start a direct message</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filtered.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => startDm(m.user_id)}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary text-left"
                >
                  <Avatar className="w-9 h-9">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{(m.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{m.display_name ?? "Member"}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground p-2">No members found.</p>}
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {convs.map((c) => {
          const title = c.type === "group" ? (c.name ?? "Group") : (c.other?.display_name ?? "Direct Message");
          const isActive = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full flex items-center gap-3 p-3 hover:bg-secondary text-left border-b border-border/30 ${
                isActive ? "bg-secondary" : ""
              }`}
            >
              <Avatar className="w-10 h-10">
                {c.type === "group" ? (
                  <>
                    {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                    <AvatarFallback><Users className="w-4 h-4" /></AvatarFallback>
                  </>
                ) : (
                  <>
                    {c.other?.avatar_url && <AvatarImage src={c.other.avatar_url} />}
                    <AvatarFallback>{(c.other?.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{title}</div>
                <div className="text-xs text-muted-foreground truncate">{c.lastMessage ?? "No messages yet"}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ConversationList;
