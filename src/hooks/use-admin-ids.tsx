import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Returns the set of user_ids that have the 'admin' role. */
export function useAdminIds() {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (cancelled) return;
      setIds(new Set((data ?? []).map((r: any) => r.user_id as string)));
    };
    load();
    const ch = supabase
      .channel("admin-ids-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return ids;
}