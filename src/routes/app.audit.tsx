import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

function AuditPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [entity, setEntity] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows(data ?? []);
      const { data: profs } = await supabase.from("profiles").select("id, full_name");
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
    })();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/app/dashboard" />;

  const filtered = rows.filter((r) => {
    if (entity !== "all" && r.entity !== entity) return false;
    if (q) {
      const hay = `${r.action} ${r.entity} ${r.entity_id ?? ""} ${profiles[r.actor_id]?.full_name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} events · auto-deleted after 90 days</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="profiles">Profiles</SelectItem>
              <SelectItem value="break_logs">Activities</SelectItem>
              <SelectItem value="user_roles">Roles</SelectItem>
              <SelectItem value="departments">Departments</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>Recent changes</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td>{profiles[r.actor_id]?.full_name ?? <span className="text-muted-foreground">system</span>}</td>
                  <td>
                    <Badge variant="outline" className={
                      r.action === "DELETE" ? "border-destructive/40 text-destructive" :
                      r.action === "INSERT" ? "border-success/40" : ""
                    }>{r.action}</Badge>
                  </td>
                  <td className="font-mono text-xs">{r.entity}</td>
                  <td className="font-mono text-xs truncate max-w-[16ch]">{r.entity_id}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No events</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}