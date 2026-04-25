import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Users, Camera, Calendar, Shield, Trash2, Megaphone, BarChart3, UserCheck, UserX, Flag, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";

const pendingMembers = [
  { name: "Aisha Khan", email: "aisha@email.com", initials: "AK", color: "from-teal-500 to-green-500", batchYear: 2024 },
  { name: "Siddharth Rao", email: "sid@email.com", initials: "SR", color: "from-orange-500 to-red-500", batchYear: 2023 },
];

const reportedContent = [
  { id: 1, reporter: "Sneha", reason: "Inappropriate caption", post: "Random party post", status: "pending" },
  { id: 2, reporter: "Kavya", reason: "Wrong person tagged", post: "College fest photo", status: "pending" },
];

const stats = [
  { label: "Total Members", value: "24", icon: Users, change: "+2 this month" },
  { label: "Total Memories", value: "1,247", icon: Camera, change: "+56 this week" },
  { label: "Active Events", value: "4", icon: Calendar, change: "2 upcoming" },
  { label: "Reports", value: "2", icon: Flag, change: "Pending review" },
];

const Admin = () => {
  const { user } = useAuth();
  if (!isAdminUser(user?.email)) return <Navigate to="/gallery" replace />;

  const [announcement, setAnnouncement] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "reports" | "announce">("overview");

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "members" as const, label: "Members", icon: Users },
    { id: "reports" as const, label: "Reports", icon: Flag },
    { id: "announce" as const, label: "Announce", icon: Megaphone },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-display font-bold text-foreground mb-6">Admin Dashboard</h1>

        {/* Tabs */}
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

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="glass-card rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-2xl font-display font-bold text-foreground">{stat.value}</span>
                  </div>
                  <p className="text-sm font-body text-muted-foreground">{stat.label}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{stat.change}</p>
                </div>
              ))}
            </div>

            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" onClick={() => setActiveTab("members")} className="justify-start gap-2">
                  <UserCheck className="w-4 h-4" />
                  Approve Members
                  <span className="ml-auto text-xs text-muted-foreground">{pendingMembers.length} pending</span>
                </Button>
                <Button variant="outline" onClick={() => setActiveTab("reports")} className="justify-start gap-2">
                  <Flag className="w-4 h-4" />
                  Review Reports
                  <span className="ml-auto text-xs text-muted-foreground">{reportedContent.length} pending</span>
                </Button>
                <Button variant="outline" onClick={() => setActiveTab("announce")} className="justify-start gap-2">
                  <Megaphone className="w-4 h-4" />
                  Send Announcement
                  <span className="ml-auto text-xs text-muted-foreground">Broadcast to all</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Members */}
        {activeTab === "members" && (
          <div className="space-y-6">
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4">Pending Approvals</h3>
              <div className="space-y-3">
                {pendingMembers.map((m) => (
                  <div key={m.email} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${m.color} flex items-center justify-center text-white font-display font-bold text-sm`}>
                      {m.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-foreground text-sm">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email} · Batch {m.batchYear}</p>
                    </div>
                    <Button size="sm" className="bg-foreground text-background text-xs">Approve</Button>
                    <Button size="sm" variant="outline" className="text-xs">Reject</Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4">All Members (24)</h3>
              <p className="text-sm text-muted-foreground font-body">Member management list would appear here with search, filter, and ban options.</p>
            </div>
          </div>
        )}

        {/* Reports */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-4">Reported Content</h3>
              <div className="space-y-4">
                {reportedContent.map((r) => (
                  <div key={r.id} className="p-4 rounded-lg bg-secondary/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-body font-medium text-foreground text-sm">Report #{r.id}</span>
                      <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">Pending</span>
                    </div>
                    <p className="text-sm text-muted-foreground font-body">{r.reporter} reported: "{r.reason}"</p>
                    <p className="text-xs text-muted-foreground">Post: {r.post}</p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="text-xs gap-1"><Eye className="w-3 h-3" />View Post</Button>
                      <Button size="sm" variant="destructive" className="text-xs gap-1"><Trash2 className="w-3 h-3" />Remove</Button>
                      <Button size="sm" variant="ghost" className="text-xs">Dismiss</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Announce */}
        {activeTab === "announce" && (
          <div className="glass-card rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-foreground">Send Announcement</h3>
            <Textarea
              placeholder="Write your announcement..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground font-body min-h-[120px]"
            />
            <Button className="bg-foreground text-background hover:bg-foreground/90 font-display gap-2">
              <Megaphone className="w-4 h-4" />
              Send to all members
            </Button>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Admin;
