import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

function AuditPage() {
  const { isAdmin, hasPermission } = useAuth();
  const allowed = isAdmin || hasPermission("view_audit");
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [reason, setReason] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("break_logs")
        .select("*")
        .gte("out_time", since)
        .order("out_time", { ascending: false })
        .limit(2000);
      setRows(data ?? []);
      const { data: profs } = await supabase.from("profiles").select("id, full_name");
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
    })();
  }, [allowed]);

  if (!allowed) return <Navigate to="/app/dashboard" />;

  const filtered = rows.filter((r) => {
    if (reason !== "all" && r.reason !== reason) return false;
    if (q) {
      const hay = `${r.reason ?? ""} ${r.remarks ?? ""} ${profiles[r.user_id]?.full_name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity record</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} activities · last 90 days</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              <SelectItem value="Tea Break">Tea Break</SelectItem>
              <SelectItem value="Lunch">Lunch</SelectItem>
              <SelectItem value="Prayer">Prayer</SelectItem>
              <SelectItem value="Shopping">Shopping</SelectItem>
              <SelectItem value="Meeting">Meeting</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>Recent activities</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Out time</th><th>In time</th><th>User</th><th>Reason</th><th>Duration</th><th>Status</th><th>Remarks</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 text-xs whitespace-nowrap">{fmtDateTime(r.out_time)}</td>
                  <td className="text-xs whitespace-nowrap">{fmtDateTime(r.in_time)}</td>
                  <td>{profiles[r.user_id]?.full_name ?? <span className="text-muted-foreground">unknown</span>}</td>
                  <td><Badge variant="secondary">{r.reason}</Badge></td>
                  <td className="text-xs">{r.duration_minutes != null ? fmtDuration(r.duration_minutes) : "—"}</td>
                  <td>
                    <Badge variant="outline" className={
                      r.status === "out" ? "border-warning/40" : "border-success/40"
                    }>{r.status === "out" ? "Live" : "Ended"}</Badge>
                  </td>
                  <td className="text-xs text-muted-foreground truncate max-w-[24ch]">{r.remarks ?? ""}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No activities</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}