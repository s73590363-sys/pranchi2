import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ConversationList from "@/components/chat/ConversationList";
import ChatRoom from "@/components/chat/ChatRoom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { setActiveConversationId } from "@/lib/active-conversation";

const DEFAULT_GROUP_ID = "00000000-0000-0000-0000-000000000001";

const Chat = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get("c");
  const [activeConv, setActiveConv] = useState<string | null>(initial);

  useEffect(() => {
    if (!user) return;
    supabase.from("conversation_participants").insert({
      conversation_id: DEFAULT_GROUP_ID,
      user_id: user.id,
    }).then(() => {});
  }, [user]);

  // Broadcast active conversation to global notifier
  useEffect(() => {
    setActiveConversationId(activeConv);
    return () => { setActiveConversationId(null); };
  }, [activeConv]);

  // Sync active conversation -> URL (one-way; URL changes from outside still reflected below)
  useEffect(() => {
    const current = searchParams.get("c");
    if (activeConv && current !== activeConv) {
      const next = new URLSearchParams(searchParams);
      next.set("c", activeConv);
      setSearchParams(next, { replace: true });
    } else if (!activeConv && current) {
      const next = new URLSearchParams(searchParams);
      next.delete("c");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv]);

  // React to URL changes from outside (toast "Open" link)
  useEffect(() => {
    const c = searchParams.get("c");
    setActiveConv((prev) => (c !== prev ? c : prev));
  }, [searchParams]);


  return (
    <div className="h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 min-h-0 max-w-6xl w-full mx-auto flex overflow-hidden">
        <aside className={`${activeConv ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-border/50`}>
          <ConversationList activeId={activeConv} onSelect={(id) => setActiveConv(id)} />
        </aside>

        <main className={`${activeConv ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0`}>
          {activeConv ? (
            <>
              <div className="md:hidden p-2 border-b border-border/50">
                <Button variant="ghost" size="sm" onClick={() => setActiveConv(null)} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              </div>
              <ChatRoom conversationId={activeConv} />
            </>
          ) : (
            <div className="flex-1 hidden md:flex items-center justify-center text-muted-foreground">
              Select a conversation
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Chat;
