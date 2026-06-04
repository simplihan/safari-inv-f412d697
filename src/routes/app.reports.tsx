import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileDown } from "lucide-react";
import { fmtDuration, fmtDateTime } from "@/lib/format";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/app/reports")({ component: Reports });

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

function Reports() {
  const { canManage } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [deviceByUser, setDeviceByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!canManage) return;
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(new Date(to).getTime() + 86400_000).toISOString();
    (async () => {
      const { data } = await supabase.from("break_logs").select("*").gte("out_time", fromIso).lt("out_time", toIso).order("out_time", { ascending: false });
      const { data: profs } = await supabase.from("profiles").select("id, full_name, department");
      setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p])));
      setRows(data ?? []);
      const { data: ev } = await supabase
        .from("login_events").select("*")
        .gte("created_at", fromIso).lt("created_at", toIso)
        .order("created_at", { ascending: false }).limit(200);
      const map: Record<string, string> = {};
      (ev ?? []).forEach((l: any) => {
        if (!map[l.user_id] && l.device) map[l.user_id] = l.device;
      });
      setDeviceByUser(map);
    })();
  }, [from, to, canManage]);

  const reasonAgg = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.reason] = (m[r.reason] ?? 0) + (r.duration_minutes ?? 0); });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const userAgg = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.user_id] = (m[r.user_id] ?? 0) + (r.duration_minutes ?? 0); });
    return Object.entries(m).map(([id, mins]) => ({ name: profiles[id]?.full_name ?? "—", mins })).sort((a, b) => b.mins - a.mins).slice(0, 10);
  }, [rows, profiles]);

  if (!canManage) return <Navigate to="/app/dashboard" />;

  const exportCSV = () => {
    const header = ["Name", "Department", "Reason", "Remarks", "Out", "In", "Duration (min)", "Device"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const p = profiles[r.user_id];
      lines.push([`"${p?.full_name ?? ""}"`, `"${p?.department ?? ""}"`, r.reason, `"${(r.remarks ?? "").replace(/"/g, "''")}"`, r.out_time, r.in_time ?? "", r.duration_minutes ?? "", deviceByUser[r.user_id] ?? ""].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pulse-inv-${from}-to-${to}.csv`; a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Pulse Safari Report  ${from} -> ${to}`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Name", "Department", "Reason", "Out", "In", "Min", "Device"]],
      body: rows.map((r) => {
        const p = profiles[r.user_id];
        return [p?.full_name ?? "—", p?.department ?? "—", r.reason, fmtDateTime(r.out_time), fmtDateTime(r.in_time), r.duration_minutes ?? "—", deviceByUser[r.user_id] ?? "—"];
      }),
    });
    doc.save(`pulse-inv-${from}-to-${to}.pdf`);
  };

  const exportXLSX = () => {
    const data = rows.map((r) => {
      const p = profiles[r.user_id];
      return {
        Name: p?.full_name ?? "—",
        Department: p?.department ?? "—",
        Reason: r.reason,
        Remarks: r.remarks ?? "",
        Out: r.out_time,
        In: r.in_time ?? "",
        "Duration (min)": r.duration_minutes ?? "",
        Device: deviceByUser[r.user_id] ?? "",
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Activities");
    XLSX.writeFile(wb, `pulse-safari-${from}-to-${to}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & analytics</h1>
          <p className="text-muted-foreground mt-1">{rows.length} sessions in range</p>
        </div>
        <div className="flex gap-2">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={exportCSV} variant="outline"><Download className="h-4 w-4 mr-2" /> CSV</Button>
        <Button onClick={exportXLSX} variant="outline"><FileDown className="h-4 w-4 mr-2" /> Excel</Button>
        <Button onClick={exportPDF} className="gradient-primary text-primary-foreground border-0"><FileDown className="h-4 w-4 mr-2" /> PDF</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass">
          <CardHeader><CardTitle>Time by reason</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={reasonAgg} dataKey="value" nameKey="name" outerRadius={90} label>
                  {reasonAgg.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader><CardTitle>Top staff (minutes out)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={userAgg}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis /><Tooltip />
                <Bar dataKey="mins" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>Activity log</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Name</th><th>Reason</th><th>Out</th><th>In</th><th>Duration</th><th>Device</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2">{profiles[r.user_id]?.full_name ?? "—"}</td>
                  <td>{r.reason}</td>
                  <td className="text-xs">{fmtDateTime(r.out_time)}</td>
                  <td className="text-xs">{fmtDateTime(r.in_time)}</td>
                  <td>{r.duration_minutes != null ? fmtDuration(r.duration_minutes) : "—"}</td>
                  <td>{deviceByUser[r.user_id] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
