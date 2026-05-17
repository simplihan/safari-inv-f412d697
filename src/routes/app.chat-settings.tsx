import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DEPARTMENTS } from "@/lib/departments";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/app/chat-settings")({ component: ChatSettings });

type Row = { department: string; enabled: boolean };

function ChatSettings() {
  const { canManage, isAdmin, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data } = await supabase.from("dept_chat_settings").select("department, enabled");
    const map = new Map<string, boolean>((data ?? []).map((r: any) => [r.department, r.enabled]));
    setRows(DEPARTMENTS.map((d) => ({ department: d, enabled: map.get(d) ?? true })));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("dept-chat-settings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "dept_chat_settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!canManage) return <Navigate to="/app/dashboard" />;

  const canEdit = (dept: string) => isAdmin || profile?.department === dept;

  const toggle = async (dept: string, next: boolean) => {
    setRows((rs) => rs.map((r) => (r.department === dept ? { ...r, enabled: next } : r)));
    const { error } = await supabase
      .from("dept_chat_settings")
      .upsert({ department: dept, enabled: next, updated_at: new Date().toISOString() }, { onConflict: "department" });
    if (error) { toast.error(error.message); load(); }
    else toast.success(`${dept} chat ${next ? "enabled" : "disabled"}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessagesSquare className="h-7 w-7 text-primary" /> Chat settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isAdmin
            ? "Turn chat on/off for any department."
            : `Turn chat on/off for your department (${profile?.department ?? "—"}).`}
        </p>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>Departments</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.department} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{r.department}</p>
                <p className="text-xs text-muted-foreground">
                  {r.enabled ? "Chat is enabled for this department" : "Chat is disabled — users can't send or open chat"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={r.enabled ? "default" : "secondary"} className={r.enabled ? "gradient-primary text-primary-foreground border-0" : ""}>
                  {r.enabled ? "On" : "Off"}
                </Badge>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => toggle(r.department, v)}
                  disabled={!canEdit(r.department)}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}