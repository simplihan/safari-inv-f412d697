import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Activity,
  UserCheck,
  Users,
  FileBarChart,
  Settings,
  LogOut,
  History,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, signOut, canManage, isStaff } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const items = [
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/app/monitoring", label: "Live Monitoring", icon: Activity, show: canManage },
    { to: "/app/timeline", label: "My Activity", icon: History, show: isStaff },
    { to: "/app/pending", label: "Pending Requests", icon: UserCheck, show: canManage },
    { to: "/app/staff", label: "Staff Management", icon: Users, show: canManage },
    { to: "/app/reports", label: "Reports", icon: FileBarChart, show: canManage },
    { to: "/app/profile", label: "Profile", icon: Settings, show: true },
  ].filter((i) => i.show);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const Sidebar = (
    <aside className="w-64 shrink-0 glass-strong h-screen sticky top-0 flex flex-col p-4 border-r border-border">
      <Link to="/app/dashboard" className="flex items-center gap-2 px-2 py-3">
        <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight">PulseHR</span>
      </Link>
      <nav className="mt-6 flex-1 space-y-1">
        {items.map((item) => {
          const active = path === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                active
                  ? "gradient-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-4 mt-4">
        <div className="flex items-center gap-3 px-2 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.profile_image ?? undefined} />
            <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
              {profile?.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{profile?.full_name}</p>
            <div className="flex gap-1 mt-0.5">
              {roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10px] py-0 px-1.5 capitalize">{r}</Badge>
              ))}
            </div>
          </div>
        </div>
        <Button onClick={handleSignOut} variant="outline" size="sm" className="w-full">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen w-full">
      <div className="hidden md:block">{Sidebar}</div>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
            />
            <motion.div
              initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }}
              transition={{ type: "spring", damping: 25 }}
              className="fixed top-0 left-0 z-50 md:hidden"
            >
              {Sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border md:hidden flex items-center px-4 h-14">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-2 font-semibold">PulseHR</span>
        </header>
        <div className="p-6 md:p-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}