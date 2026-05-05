import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ConversationList from "@/components/chat/ConversationList";
import ChatRoom from "@/components/chat/ChatRoom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const DEFAULT_GROUP_ID = "00000000-0000-0000-0000-000000000001";

const Chat = () => {
  const { user } = useAuth();
  const [activeConv, setActiveConv] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Ensure participation in default group (in case trigger missed)
    supabase.from("conversation_participants").insert({
      conversation_id: DEFAULT_GROUP_ID,
      user_id: user.id,
    }).then(() => {});
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-6xl w-full mx-auto flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${activeConv ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-border/50`}
        >
          <ConversationList
            activeId={activeConv}
            onSelect={(id) => setActiveConv(id)}
          />
        </aside>

        {/* Active conversation */}
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
