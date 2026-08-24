import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppPermission } from "@/hooks/use-auth";

/**
 * Department scope for a given module permission.
 *
 * - admin, or a GLOBAL grant for the permission -> `depts === null` (all departments)
 * - a DEPARTMENT grant (or plain manager/supervisor/staff role) -> only the
 *   viewer's own departments (primary + any extra multi-department assignments)
 */
export function useScopedDepartments(perm: AppPermission) {
  const { user, profile, isAdmin, hasGlobalPermission } = useAuth();
  const global = isAdmin || hasGlobalPermission(perm);
  const [own, setOwn] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || global) {
        if (!cancelled) {
          setOwn([]);
          setReady(true);
        }
        return;
      }
      const { data } = await supabase
        .from("user_departments")
        .select("department")
        .eq("user_id", user.id);
      if (cancelled) return;
      const list = new Set<string>((data ?? []).map((r: any) => r.department));
      if (profile?.department) list.add(profile.department);
      setOwn([...list]);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.department, global]);

  return { depts: global ? null : own, global, ready };
}
