import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDateTime } from "@/lib/format";
import { Search } from "lucide-react";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

const PROFILE_FIELDS: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  mobile: "Mobile",
  department: "Department",
  status: "Status",
  profile_image: "Profile image",
  notif_enabled: "Notifications",
  sgc_id: "SGC ID",
};

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  actor_id: string | null;
  entity_id: string | null;
  payload: { old?: Record<string, any>; new?: Record<string, any> } | null;
}

function AuditPage() {
  const { isAdmin, hasPermission } = useAuth();
  const allowed = isAdmin || hasPermission("view_audit");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [action, setAction] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("entity", "profiles")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      setRows((data ?? []) as AuditRow[]);
      const { data: profs } = await supabase.from("profiles").select("id, full_name");
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
    })();
  }, [allowed]);

  if (!allowed) return <Navigate to="/app/dashboard" />;

  const filtered = rows.filter((r) => {
    if (action !== "all" && r.action !== action) return false;
    if (q) {
      const targetName = profiles[r.entity_id ?? ""]?.full_name ?? "";
      const actorName = profiles[r.actor_id ?? ""]?.full_name ?? "";
      const hay = `${targetName} ${actorName} ${r.action ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit log</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} profile changes · last 90 days</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="INSERT">Insert</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>Profile update log</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Profile</th><th>Changed by</th><th>Time</th><th>Changes</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2">
                    {profiles[r.entity_id ?? ""]?.full_name ?? <span className="text-muted-foreground">unknown</span>}
                  </td>
                  <td>
                    {r.actor_id ? (
                      profiles[r.actor_id]?.full_name ?? <span className="text-muted-foreground">unknown</span>
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td className="text-xs">
                    <ChangeSummary payload={r.payload} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No profile changes</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ChangeSummary({ payload }: { payload: AuditRow["payload"] }) {
  const changes = useMemo(() => {
    const old = payload?.old ?? {};
    const neu = payload?.new ?? {};
    return Object.entries(PROFILE_FIELDS)
      .filter(([key]) => old[key as keyof typeof old] !== neu[key as keyof typeof neu])
      .map(([key, label]) => ({ key, label, old: old[key], new: neu[key] }));
  }, [payload]);

  if (changes.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {changes.map((c) => (
        <Badge key={c.key} variant="secondary" className="font-normal">
          {c.label}: <span className="line-through opacity-70">{formatValue(c.old)}</span> → {formatValue(c.new)}
        </Badge>
      ))}
    </div>
  );
}

function formatValue(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "On" : "Off";
  return String(v);
}
