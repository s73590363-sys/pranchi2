import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminUser } from "@/lib/admin";
import { useChatUnread } from "@/hooks/use-chat-unread";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const isAdmin = isAdminUser(user?.email);
  const { total: unreadTotal } = useChatUnread();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const links = [
    { to: "/gallery", label: "Gallery", badge: 0 },
    { to: "/chat", label: "Chat", badge: unreadTotal },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", badge: 0 }] : []),
  ];

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-border/50 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/" className="text-xl font-bold font-display text-foreground">
          Alpha Squad
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-4">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-body transition-colors ${
                location.pathname === link.to
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2 text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden mt-3 flex flex-col gap-2 pb-3">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={`text-sm font-body px-2 py-1 rounded transition-colors ${
                location.pathname === link.to
                  ? "text-foreground bg-secondary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user && (
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="justify-start gap-2 text-muted-foreground">
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
