import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type UnreadMap = Record<string, number>;

/**
 * Tracks unread message counts per conversation for the current user.
 * Unread = messages newer than this user's `last_read_at` and not authored by them.
 */
export const useChatUnread = () => {
  const { user } = useAuth();
  const [unread, setUnread] = useState<UnreadMap>({});

  const load = useCallback(async () => {
    if (!user) { setUnread({}); return; }
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);
    if (!parts?.length) { setUnread({}); return; }

    const next: UnreadMap = {};
    await Promise.all(parts.map(async (p) => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", p.conversation_id)
        .gt("created_at", p.last_read_at)
        .neq("user_id", user.id);
      next[p.conversation_id] = count ?? 0;
    }));
    setUnread(next);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("unread-tracker")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  const total = Object.values(unread).reduce((a, b) => a + b, 0);
  return { unread, total, refresh: load };
};
