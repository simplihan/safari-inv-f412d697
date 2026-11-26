import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useRegistrationStatus } from "@/hooks/use-registration-status";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function RegistrationSwitch() {
  const { enabled, error, refresh, setEnabled } = useRegistrationStatus();
  const [saving, setSaving] = useState(false);

  const change = async (next: boolean) => {
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase.rpc("set_registration_enabled", { _enabled: next });
      if (saveError) throw saveError;
      setEnabled(data === true);
      toast.success(next ? "New access requests are open." : "New access requests are paused.");
    } catch {
      toast.error("Could not change access requests. Please try again.");
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-y border-border py-4">
      <div className="min-w-0">
        <Label htmlFor="new-user-registration" className="text-base font-semibold">New user registration</Label>
        <p className="text-sm text-muted-foreground mt-1" aria-live="polite">
          {error ? "Status unavailable" : enabled === null ? "Loading…" : enabled ? "ON · Access requests open" : "OFF · Access requests paused"}
        </p>
      </div>
      {error ? (
        <Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button>
      ) : (
        <Switch id="new-user-registration" checked={enabled === true} disabled={enabled === null || saving} onCheckedChange={(next) => void change(next)} />
      )}
    </div>
  );
}