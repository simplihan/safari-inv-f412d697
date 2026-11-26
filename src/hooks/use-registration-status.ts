import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export async function readRegistrationStatus() {
  const { data, error } = await supabase.rpc("get_registration_enabled");
  if (error) throw error;
  return data === true;
}

export function useRegistrationStatus() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const next = await readRegistrationStatus();
      setEnabled(next);
      setError(false);
    } catch {
      setEnabled(null);
      setError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { enabled, error, refresh, setEnabled };
}