import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveConversationId } from "@/lib/active-conversation";

/**
 * Subscribes to new messages across all conversations the user participates in
 * and shows a toast when a message arrives in a conversation that is NOT
 * currently open. Mounted once at the app root.
 */
const ChatNotifier = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const myConvIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadParticipating = async () => {
      const { data } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);
      myConvIds.current = new Set((data ?? []).map((p) => p.conversation_id));
    };

    loadParticipating();

    const ch = supabase
      .channel("global-chat-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: any) => {
          if (cancelled) return;
          const m = payload.new;
          if (!m || m.user_id === user.id) return;
          if (!myConvIds.current.has(m.conversation_id)) return;
          if (getActiveConversationId() === m.conversation_id) return;

          // Look up author + conversation for a richer toast
          const [{ data: prof }, { data: conv }] = await Promise.all([
            supabase.from("profiles").select("display_name").eq("user_id", m.user_id).maybeSingle(),
            supabase.from("conversations").select("type, name").eq("id", m.conversation_id).maybeSingle(),
          ]);
          const author = prof?.display_name ?? "Someone";
          const where = conv?.type === "group" ? (conv.name ?? "Group") : "Direct message";
          const preview = m.media_type === "text"
            ? (m.content ?? "")
            : `📎 ${m.media_type}`;

          toast(`${author} · ${where}`, {
            description: preview.length > 80 ? preview.slice(0, 80) + "…" : preview,
            action: {
              label: "Open",
              onClick: () => navigate(`/chat?c=${m.conversation_id}`),
            },
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
        () => loadParticipating()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id, navigate]);

  return null;
};

export default ChatNotifier;
