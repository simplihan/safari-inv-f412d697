import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();
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
      const { data } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: { user_id: string }[] | null }>)("list_visible_user_ids");
      if (cancelled) return;
      const visible = new Set<string>((data ?? []).map((r) => r.user_id));
      visible.add(user.id);
      setIds(visible);
      setReady(true);
    };
    load();
    const ch = supabase
      .channel("visible-ids-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return { ids, ready };
}