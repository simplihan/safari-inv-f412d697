import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/app/monthly")({ component: MonthlyReports });

// Categorization thresholds (average break minutes per day in the month)
// Low = ideal (<= 90 min/day), Medium = watch, High = needs attention.
const LOW_MAX = 60;   // <= 60 min / day
const MED_MAX = 91;  // <= 91 min / day

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function elapsedDays(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const now = new Date();
  if (y === now.getUTCFullYear() && m === now.getUTCMonth() + 1) {
    return now.getUTCDate();
  }
  return daysInMonth(ym);
}

function categorize(mins: number, days: number): "Low" | "Medium" | "High" {
  const avgPerDay = days > 0 ? mins / days : 0;
  if (avgPerDay <= LOW_MAX) return "Low";
  if (avgPerDay <= MED_MAX) return "Medium";
  return "High";
}

function monthRange(ym: string) {
  // ym = "YYYY-MM"
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end, label: `${y}-${String(m).padStart(2, "0")}` };
}

function lastMonthYM() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function thisMonthYM() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function MonthlyReports() {
  const { canManage, isAdmin, profile } = useAuth();
  const [ym, setYm] = useState(thisMonthYM());
  const [dept, setDept] = useState<string>("__all");
  const [departments, setDepartments] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  // Department filter: admin sees all + can pick one; manager/supervisor scoped to own dept
  const scopedDept = isAdmin ? (dept === "__all" ? null : dept) : profile?.department ?? null;

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("departments").select("name").order("name").then(({ data }) => {
      setDepartments((data ?? []).map((d: any) => d.name));
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!canManage) return;
    const { start, end } = monthRange(ym);
    setLoading(true);
    (async () => {
      const { data: logs } = await supabase
        .from("break_logs")
        .select("*")
        .gte("out_time", start.toISOString())
        .lt("out_time", end.toISOString());
      const { data: profs } = await supabase.from("profiles").select("id, full_name, department, sgc_id");
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
      setRows(logs ?? []);
      setLoading(false);
    })();
  }, [ym, canManage]);

  // Auto-notification: prompt to download last month on day 1-5 of current month
  useEffect(() => {
    if (!canManage) return;
    const today = new Date();
    if (today.getUTCDate() > 5) return;
    const lm = lastMonthYM();
    const key = `monthly-report-notified-${lm}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    toast.info(`Monthly report ready for ${lm}`, {
      description: "Download the previous month's activity report.",
      duration: 10000,
      action: { label: "Open", onClick: () => setYm(lm) },
    });
  }, [canManage]);

  const aggregated = useMemo(() => {
    const days = elapsedDays(ym);
    const byUser: Record<string, { id: string; mins: number; sessions: number }> = {};
    for (const r of rows) {
      const p = profiles[r.user_id];
      if (scopedDept && p?.department !== scopedDept) continue;
      const k = r.user_id;
      if (!byUser[k]) byUser[k] = { id: k, mins: 0, sessions: 0 };
      byUser[k].mins += r.duration_minutes ?? 0;
      byUser[k].sessions += 1;
    }
    return Object.values(byUser)
      .map((u) => {
        const p = profiles[u.id] ?? {};
        return {
          user_id: u.id,
          name: p.full_name ?? "—",
          sgc_id: p.sgc_id ?? "—",
          department: p.department ?? "—",
          total_minutes: u.mins,
          sessions: u.sessions,
          avg_minutes: u.sessions ? Math.round(u.mins / u.sessions) : 0,
          avg_per_day: Math.round(u.mins / days),
          category: categorize(u.mins, days),
        };
      })
      .sort((a, b) => b.total_minutes - a.total_minutes);
  }, [rows, profiles, scopedDept, ym]);

  const counts = useMemo(() => {
    const c = { Low: 0, Medium: 0, High: 0 };
    aggregated.forEach((a) => { c[a.category]++; });
    return c;
  }, [aggregated]);

  if (!canManage) return <Navigate to="/app/dashboard" />;

  const exportXLSX = () => {
    const { label } = monthRange(ym);
    const summary = aggregated.map((a) => ({
      Name: a.name,
      "SGC ID": a.sgc_id,
      Department: a.department,
      "Total Minutes": a.total_minutes,
      "Total (h:m)": fmtDuration(a.total_minutes),
      Sessions: a.sessions,
      "Avg per Session (min)": a.avg_minutes,
      Category: a.category,
    }));
    const detail = rows
      .filter((r) => !scopedDept || profiles[r.user_id]?.department === scopedDept)
      .map((r) => {
        const p = profiles[r.user_id] ?? {};
        return {
          Name: p.full_name ?? "—",
          "SGC ID": p.sgc_id ?? "—",
          Department: p.department ?? "—",
          Reason: r.reason,
          Remarks: r.remarks ?? "",
          Out: r.out_time,
          In: r.in_time ?? "",
          "Duration (min)": r.duration_minutes ?? "",
        };
      });

    const wb = XLSX.utils.book_new();
    const sws = XLSX.utils.json_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, sws, "Summary");
    const dws = XLSX.utils.json_to_sheet(detail);
    XLSX.utils.book_append_sheet(wb, dws, "Detail");

    const meta = [
      { Field: "Month", Value: label },
      { Field: "Department", Value: scopedDept ?? "All" },
      { Field: "Generated", Value: new Date().toISOString() },
      { Field: "Low threshold (min)", Value: `≤ ${LOW_MAX}` },
      { Field: "Medium threshold (min)", Value: `≤ ${MED_MAX}` },
      { Field: "High threshold (min)", Value: `> ${MED_MAX}` },
      { Field: "Low count", Value: counts.Low },
      { Field: "Medium count", Value: counts.Medium },
      { Field: "High count", Value: counts.High },
    ];
    const mws = XLSX.utils.json_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, mws, "Meta");

    XLSX.writeFile(wb, `pulse-monthly-${label}${scopedDept ? `-${scopedDept}` : ""}.xlsx`);
    toast.success("Monthly report downloaded");
  };

  const months = useMemo(() => {
    // Last 12 months options
    const out: string[] = [];
    const d = new Date();
    d.setUTCDate(1);
    for (let i = 0; i < 12; i++) {
      out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return out;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monthly Reports</h1>
          <p className="text-muted-foreground mt-1">
            Activity categorised by average break time per day. Low = ideal (≤ 60 min/day), Medium = 61–91, High = needs attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label>Month</Label>
            <Select value={ym} onValueChange={setYm}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}{m === thisMonthYM() ? " (current)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div>
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All departments</SelectItem>
                  {departments.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={exportXLSX} className="gradient-primary text-primary-foreground border-0">
            <FileDown className="h-4 w-4 mr-2" /> Download Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="glass">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Low (ideal)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">{counts.Low}</div>
            <p className="text-xs text-muted-foreground mt-1">≤ {LOW_MAX} min / day</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Medium</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">{counts.Medium}</div>
            <p className="text-xs text-muted-foreground mt-1">{LOW_MAX + 1}–{MED_MAX} min / day</p>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">High</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-rose-500">{counts.High}</div>
            <p className="text-xs text-muted-foreground mt-1">&gt; {MED_MAX} min / day</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {ym} — {aggregated.length} staff{scopedDept ? ` · ${scopedDept}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : aggregated.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No activity in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th>SGC</th>
                  <th>Department</th>
                  <th>Sessions</th>
                  <th>Total</th>
                  <th>Avg/day</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.map((a) => (
                  <tr key={a.user_id} className="border-t border-border">
                    <td className="py-2 font-medium">{a.name}</td>
                    <td className="text-xs">{a.sgc_id}</td>
                    <td className="text-xs">{a.department}</td>
                    <td>{a.sessions}</td>
                    <td>{fmtDuration(a.total_minutes)}</td>
                    <td>{a.avg_per_day} min</td>
                    <td>
                      <Badge
                        className={
                          a.category === "Low"
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                            : a.category === "Medium"
                            ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                            : "bg-rose-500/15 text-rose-600 border-rose-500/30"
                        }
                        variant="outline"
                      >
                        {a.category}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
