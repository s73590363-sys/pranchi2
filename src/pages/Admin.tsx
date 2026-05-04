import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Users, Camera, FolderOpen, Trash2, BarChart3, Heart, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface RecentPost {
  id: string;
  caption: string | null;
  image_url: string | null;
  media_type: string;
  created_at: string;
  user_id: string;
  likes_count: number;
  author_name?: string | null;
  comments_count?: number;
}

const Admin = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "posts">("overview");

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ members: 0, posts: 0, folders: 0, likes: 0, comments: 0 });
  const [members, setMembers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<RecentPost[]>([]);

  const refresh = async () => {
    setLoading(true);
    const [{ count: memberCount }, { count: postCount }, { count: folderCount }, { count: likeCount }, { count: commentCount }, { data: memberRows }, { data: postRows }] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("id", { count: "exact", head: true }),
      supabase.from("gallery_folders").select("id", { count: "exact", head: true }),
      supabase.from("post_likes").select("id", { count: "exact", head: true }),
      supabase.from("post_comments").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("user_id, display_name, avatar_url, created_at").order("created_at", { ascending: false }),
      supabase.from("posts").select("id, caption, image_url, media_type, created_at, user_id, likes_count").order("created_at", { ascending: false }).limit(50),
    ]);

    setStats({
      members: memberCount ?? 0,
      posts: postCount ?? 0,
      folders: folderCount ?? 0,
      likes: likeCount ?? 0,
      comments: commentCount ?? 0,
    });
    setMembers(memberRows ?? []);

    // enrich posts with author name + comment counts
    const rows = postRows ?? [];
    const ids = rows.map((p) => p.id);
    const userIds = Array.from(new Set(rows.map((p) => p.user_id)));
    const [{ data: authors }, { data: cmts }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("user_id, display_name").in("user_id", userIds) : Promise.resolve({ data: [] } as any),
      ids.length ? supabase.from("post_comments").select("post_id").in("post_id", ids) : Promise.resolve({ data: [] } as any),
    ]);
    const nameMap = new Map<string, string>();
    (authors || []).forEach((a: any) => nameMap.set(a.user_id, a.display_name || "Member"));
    const ccMap: Record<string, number> = {};
    (cmts || []).forEach((c: any) => { ccMap[c.post_id] = (ccMap[c.post_id] || 0) + 1; });
    setPosts(rows.map((p) => ({ ...p, author_name: nameMap.get(p.user_id) ?? "Member", comments_count: ccMap[p.id] ?? 0 })));

    setLoading(false);
  };

  useEffect(() => {
    if (!isAdminUser(user?.email)) return;
    refresh();
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_folders" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!isAdminUser(user?.email)) return <Navigate to="/gallery" replace />;

  const handleDeletePost = async (post: RecentPost) => {
    if (!confirm("Delete this post permanently?")) return;
    if (post.image_url) {
      const path = post.image_url.split("/post-images/")[1];
      if (path) await supabase.storage.from("post-images").remove([path]);
    }
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Post removed" });
    }
  };

  const statCards = [
    { label: "Members", value: stats.members, icon: Users },
    { label: "Memories", value: stats.posts, icon: Camera },
    { label: "Folders", value: stats.folders, icon: FolderOpen },
    { label: "Likes", value: stats.likes, icon: Heart },
    { label: "Comments", value: stats.comments, icon: MessageCircle },
  ];

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "members" as const, label: `Members (${stats.members})`, icon: Users },
    { id: "posts" as const, label: `Posts (${stats.posts})`, icon: Camera },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-display font-bold text-foreground mb-6">Admin Dashboard</h1>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-body transition-all whitespace-nowrap ${
                activeTab === tab.id ? "bg-primary text-primary-foreground" : "glass-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {statCards.map((s) => (
                <div key={s.label} className="glass-card rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <s.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-2xl font-display font-bold text-foreground">{s.value}</span>
                  </div>
                  <p className="text-sm font-body text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground font-body">Stats update in real time as members interact.</p>
          </div>
        )}

        {!loading && activeTab === "members" && (
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">All Members</h3>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground font-body">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-primary-foreground font-display font-bold text-sm overflow-hidden">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (m.display_name?.[0] ?? "M").toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-foreground text-sm truncate">{m.display_name || "Unnamed Member"}</p>
                      <p className="text-xs text-muted-foreground">Joined {new Date(m.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === "posts" && (
          <div className="glass-card rounded-xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Recent Posts</h3>
            {posts.length === 0 ? (
              <p className="text-sm text-muted-foreground font-body">No posts yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {posts.map((p) => (
                  <div key={p.id} className="flex gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-16 h-16 rounded-md overflow-hidden bg-secondary flex-shrink-0">
                      {p.image_url && (p.media_type === "video" ? (
                        <video src={p.image_url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-foreground text-sm truncate">{p.caption || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">by {p.author_name} · {new Date(p.created_at).toLocaleDateString()}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{p.likes_count}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{p.comments_count}</span>
                      </p>
                    </div>
                    <Button size="icon" variant="destructive" onClick={() => handleDeletePost(p)} className="self-start">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Admin;
