import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Department {
  id: string;
  name: string;
}

export function useDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("list_departments_public");
    setDepartments((data as Department[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("departments-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "departments" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { departments, names: departments.map((d) => d.name), loading, reload: load };
}