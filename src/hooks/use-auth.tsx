import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "supervisor" | "staff";
export type UserStatus = "pending" | "approved" | "rejected";

export type AppPermission =
  | "view_reports"
  | "view_monthly"
  | "view_monitoring"
  | "view_pending"
  | "manage_staff"
  | "view_audit"
  | "send_notifications"
  | "manage_chat_settings"
  | "cross_department";

export type PermissionScope = "department" | "global";

export interface PermissionGrant {
  permission: AppPermission;
  scope: PermissionScope;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  sgc_id: string | null;
  mobile: string | null;
  department: string | null;
  status: UserStatus;
  profile_image: string | null;
  notif_enabled?: boolean;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: PermissionGrant[];
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isSupervisor: boolean;
  isStaff: boolean;
  canManage: boolean;
  hasPermission: (p: AppPermission) => boolean;
  hasGlobalPermission: (p: AppPermission) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: roleRows }, { data: permRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("permission, scope").eq("user_id", userId),
    ]);
    setProfile((prof as Profile) ?? null);
    setRoles(((roleRows as { role: AppRole }[]) ?? []).map((r) => r.role));
    setPermissions(((permRows as PermissionGrant[]) ?? []));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
        // 10h auto-logout
        const loginAt = Number(localStorage.getItem("loginAt") || 0);
        if (!loginAt) localStorage.setItem("loginAt", String(Date.now()));
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        localStorage.removeItem("loginAt");
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // 10h auto-logout watcher
  useEffect(() => {
    if (!session) return;
    const check = () => {
      const loginAt = Number(localStorage.getItem("loginAt") || Date.now());
      if (Date.now() - loginAt > TEN_HOURS_MS) {
        supabase.auth.signOut();
      }
    };
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [session]);

  const signOut = async () => {
    localStorage.removeItem("loginAt");
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isSupervisor = roles.includes("supervisor");
  const isStaff = roles.includes("staff");
  const hasPermission = (p: AppPermission) =>
    isAdmin || permissions.some((g) => g.permission === p);
  const hasGlobalPermission = (p: AppPermission) =>
    isAdmin || permissions.some((g) => g.permission === p && g.scope === "global");

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        profile,
        roles,
        permissions,
        loading,
        signOut,
        refresh,
        isAdmin,
        isManager,
        isSupervisor,
        isStaff,
        canManage: isAdmin || isManager || isSupervisor,
        hasPermission,
        hasGlobalPermission,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}