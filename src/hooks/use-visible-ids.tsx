import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";

/**
 * Returns the set of user_ids the current viewer is allowed to see in
 * dashboards/monitoring, based on role hierarchy + department scope.
 *
 * Rules:
 *  - admin: everyone
 *  - manager: manager + supervisor + staff in same department
 *  - supervisor: supervisor + staff in same department
 *  - staff: staff only, same department
 *
 * `ready` is false until both directory + roles have loaded once, so callers
 * can avoid showing "everything" during the brief warm-up window.
 */
export function useVisibleIds() {
  const { user, profile, isAdmin, isManager, isSupervisor } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) {
        setIds(new Set());
        setReady(true);
        return;
      }
      const [{ data: dir }, { data: roleRows }] = await Promise.all([
        supabase.rpc("list_directory"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (cancelled) return;

      const rolesByUser = new Map<string, Set<AppRole>>();
      ((roleRows ?? []) as { user_id: string; role: AppRole }[]).forEach((r) => {
        if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, new Set());
        rolesByUser.get(r.user_id)!.add(r.role);
      });

      const allowedRoles: AppRole[] = isAdmin
        ? ["admin", "manager", "supervisor", "staff"]
        : isManager
          ? ["manager", "supervisor", "staff"]
          : isSupervisor
            ? ["supervisor", "staff"]
            : ["staff"];
      const allowedSet = new Set(allowedRoles);

      const dept = profile?.department ?? null;
      const visible = new Set<string>();
      ((dir ?? []) as { id: string; department: string | null }[]).forEach((p) => {
        const rs = rolesByUser.get(p.id) ?? new Set<AppRole>(["staff"]);
        // Admins always visible to admins only — exclude from non-admin scopes.
        if (!isAdmin && rs.has("admin")) return;
        const roleMatch = Array.from(rs).some((r) => allowedSet.has(r));
        if (!roleMatch) return;
        if (!isAdmin && dept && p.department !== dept) return;
        visible.add(p.id);
      });
      // Always include self
      visible.add(user.id);
      setIds(visible);
      setReady(true);
    };
    load();
    const ch = supabase
      .channel("visible-ids-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id, profile?.department, isAdmin, isManager, isSupervisor]);

  return { ids, ready };
}