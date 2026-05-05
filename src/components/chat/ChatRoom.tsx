import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, Square, Send, Paperclip, Smile, Reply, Trash2, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_EMAIL } from "@/lib/admin";

interface Msg {
  id: string;
  conversation_id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "text" | "image" | "video" | "voice";
  reply_to_id: string | null;
  created_at: string;
}

interface Reaction { id: string; message_id: string; user_id: string; emoji: string; }
interface Profile { user_id: string; display_name: string | null; avatar_url: string | null; }

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const ChatRoom = ({ conversationId }: { conversationId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;

  const loadProfiles = async (ids: string[]) => {
    const missing = ids.filter((id) => !profiles[id]);
    if (!missing.length) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", missing);
    setProfiles((prev) => {
      const next = { ...prev };
      (data ?? []).forEach((p) => { next[p.user_id] = p; });
      return next;
    });
  };

  const loadAll = useCallback(async () => {
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((msgs ?? []) as Msg[]);
    const ids = [...new Set((msgs ?? []).map((m) => m.user_id))];
    if (ids.length) await loadProfiles(ids);
    const msgIds = (msgs ?? []).map((m) => m.id);
    if (msgIds.length) {
      const { data: rxs } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", msgIds);
      setReactions((rxs ?? []) as Reaction[]);
    } else {
      setReactions([]);
    }
    // mark read
    if (user) {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    }
  }, [conversationId, user?.id]);

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_indicators", filter: `conversation_id=eq.${conversationId}` }, async () => {
        const { data } = await supabase
          .from("typing_indicators")
          .select("user_id, updated_at")
          .eq("conversation_id", conversationId)
          .gt("updated_at", new Date(Date.now() - 5000).toISOString());
        setTypingUsers((data ?? []).map((t) => t.user_id).filter((id) => id !== user?.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, loadAll, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const broadcastTyping = async () => {
    if (!user) return;
    await supabase.from("typing_indicators").upsert(
      { conversation_id: conversationId, user_id: user.id, updated_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" }
    );
    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(async () => {
      await supabase.from("typing_indicators").delete()
        .eq("conversation_id", conversationId).eq("user_id", user.id);
    }, 3000);
  };

  const sendText = async () => {
    if (!text.trim() || !user) return;
    const body = text.trim();
    setText("");
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      content: body,
      media_type: "text",
      reply_to_id: reply?.id ?? null,
    });
    setReply(null);
    await supabase.from("typing_indicators").delete()
      .eq("conversation_id", conversationId).eq("user_id", user.id);
  };

  const uploadAndSend = async (file: Blob, kind: "image" | "video" | "voice", filename: string) => {
    if (!user) return;
    const ext = filename.split(".").pop() || (kind === "voice" ? "webm" : "bin");
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
      contentType: file.type || (kind === "voice" ? "audio/webm" : undefined),
    });
    if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); return; }
    const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      media_url: pub.publicUrl,
      media_type: kind,
      reply_to_id: reply?.id ?? null,
    });
    setReply(null);
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files) {
      const kind = f.type.startsWith("video/") ? "video" : "image";
      await uploadAndSend(f, kind, f.name);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunks.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(recChunks.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await uploadAndSend(blob, "voice", "voice.webm");
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (err: any) {
      toast({ title: "Microphone error", description: err.message, variant: "destructive" });
    }
  };

  const stopRecording = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
  };

  const deleteMessage = async (id: string) => {
    await supabase.from("messages").delete().eq("id", id);
    setConfirmDelete(null);
  };

  const renderReactionChips = (m: Msg) => {
    const grouped: Record<string, number> = {};
    reactions.filter((r) => r.message_id === m.id).forEach((r) => {
      grouped[r.emoji] = (grouped[r.emoji] ?? 0) + 1;
    });
    const entries = Object.entries(grouped);
    if (!entries.length) return null;
    return (
      <div className="flex gap-1 mt-1 flex-wrap">
        {entries.map(([e, c]) => (
          <button
            key={e}
            onClick={() => toggleReaction(m.id, e)}
            className="text-xs bg-secondary rounded-full px-2 py-0.5 hover:bg-secondary/70"
          >
            {e} {c}
          </button>
        ))}
      </div>
    );
  };

  const findMsg = (id: string | null) => id ? messages.find((m) => m.id === id) : null;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => {
          const isMe = m.user_id === user?.id;
          const prof = profiles[m.user_id];
          const repliedTo = findMsg(m.reply_to_id);
          const canDelete = isMe || isAdmin;
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
              {!isMe && (
                <Avatar className="w-8 h-8 mt-1">
                  {prof?.avatar_url && <AvatarImage src={prof.avatar_url} />}
                  <AvatarFallback>{(prof?.display_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[75%] group`}>
                {!isMe && <div className="text-xs text-muted-foreground mb-0.5">{prof?.display_name ?? "Member"}</div>}
                <div className={`rounded-2xl px-3 py-2 ${isMe ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                  {repliedTo && (
                    <div className="text-xs opacity-70 border-l-2 border-current pl-2 mb-1 truncate">
                      {repliedTo.content ?? `📎 ${repliedTo.media_type}`}
                    </div>
                  )}
                  {m.media_type === "text" && <div className="whitespace-pre-wrap break-words text-sm">{m.content}</div>}
                  {m.media_type === "image" && m.media_url && (
                    <img src={m.media_url} alt="shared" className="rounded-lg max-h-80" />
                  )}
                  {m.media_type === "video" && m.media_url && (
                    <video src={m.media_url} controls className="rounded-lg max-h-80" />
                  )}
                  {m.media_type === "voice" && m.media_url && (
                    <audio src={m.media_url} controls className="max-w-full" />
                  )}
                </div>
                {renderReactionChips(m)}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="text-xs text-muted-foreground hover:text-foreground"><Smile className="w-3 h-3" /></button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-1 flex gap-1">
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => toggleReaction(m.id, e)} className="text-lg hover:bg-secondary rounded p-1">{e}</button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <button onClick={() => setReply(m)} className="text-xs text-muted-foreground hover:text-foreground"><Reply className="w-3 h-3" /></button>
                  {canDelete && (
                    <button onClick={() => setConfirmDelete(m.id)} className="text-xs text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {typingUsers.length > 0 && (
          <div className="text-xs text-muted-foreground italic">
            {typingUsers.map((id) => profiles[id]?.display_name ?? "Someone").join(", ")} typing...
          </div>
        )}
      </div>

      {reply && (
        <div className="px-3 py-2 border-t border-border/50 flex items-center gap-2 bg-secondary/50">
          <Reply className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 text-xs truncate">Replying to: {reply.content ?? `📎 ${reply.media_type}`}</div>
          <button onClick={() => setReply(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="p-3 border-t border-border/50 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onPickFiles} className="hidden" />
        <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()} aria-label="Attach">
          <Paperclip className="w-4 h-4" />
        </Button>
        {recording ? (
          <Button size="icon" variant="destructive" onClick={stopRecording} aria-label="Stop recording">
            <Square className="w-4 h-4" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" onClick={startRecording} aria-label="Voice message">
            <Mic className="w-4 h-4" />
          </Button>
        )}
        <Input
          value={text}
          onChange={(e) => { setText(e.target.value); broadcastTyping(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
          placeholder={recording ? "Recording..." : "Type a message"}
          disabled={recording}
        />
        <Button size="icon" onClick={sendText} disabled={!text.trim()} aria-label="Send">
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteMessage(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatRoom;
