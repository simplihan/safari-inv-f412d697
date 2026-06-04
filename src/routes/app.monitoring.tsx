import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Activity } from "lucide-react";
import { liveDuration, fmtTime } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/app/monitoring")({ component: Monitoring });

type Row = {
  id: string;
  full_name: string;
  department: string | null;
  profile_image: string | null;
  active?: { id: string; reason: string; out_time: string; remarks: string | null };
};

function Monitoring() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [tick, setTick] = useState(0);
  const [openUser, setOpenUser] = useState<Row | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, department, profile_image")
      .eq("status", "approved")
      .order("full_name");
    const { data: open } = await supabase
      .from("break_logs")
      .select("id, user_id, reason, out_time, remarks")
      .eq("status", "out");
    const map = new Map((open ?? []).map((b: any) => [b.user_id, b]));
    setRows((profiles ?? []).map((p: any) => ({ ...p, active: map.get(p.id) })));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("mon-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[], [rows]);

  const filtered = rows.filter((r) => {
    if (dept !== "all" && r.department !== dept) return false;
    if (q && !r.full_name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const out = filtered.filter((r) => r.active);
  const inOffice = filtered.filter((r) => !r.active);

  const openTimeline = async (r: Row) => {
    setOpenUser(r);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("break_logs").select("*").eq("user_id", r.id)
      .gte("out_time", start.toISOString()).order("out_time", { ascending: false });
    setTimeline(data ?? []);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Live monitoring</h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Realtime — updates instantly
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search staff..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="md:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Total staff" value={filtered.length} />
        <StatTile label="Currently out" value={out.length} accent="warning" />
        <StatTile label="In office" value={inOffice.length} accent="success" />
        <StatTile label="Departments" value={departments.length} />
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Currently out · {out.length}</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {out.map((r) => (
            <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card onClick={() => openTimeline(r)} className="glass-strong cursor-pointer hover:shadow-lg transition-shadow border-warning/30">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={r.profile_image ?? undefined} />
                      <AvatarFallback className="gradient-primary text-primary-foreground">
                        {r.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.department}</p>
                    </div>
                    <Badge className="bg-warning/20 text-foreground border-warning/40">{r.active!.reason}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">since {fmtTime(r.active!.out_time)}</span>
                    <span className="font-mono font-bold text-gradient tabular-nums" key={tick}>
                      {liveDuration(r.active!.out_time)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {out.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-6">Everyone's in.</p>}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">In office · {inOffice.length}</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {inOffice.map((r) => (
            <Card key={r.id} onClick={() => openTimeline(r)} className="glass cursor-pointer hover:shadow-lg transition-shadow">
              <CardContent className="p-4 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={r.profile_image ?? undefined} />
                  <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                    {r.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.department ?? "—"}</p>
                </div>
                <span className="h-2 w-2 rounded-full bg-success" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Dialog open={!!openUser} onOpenChange={(o) => !o && setOpenUser(null)}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> {openUser?.full_name} — today
            </DialogTitle>
          </DialogHeader>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No activity today.</p>
          ) : (
            <ul className="space-y-3 max-h-96 overflow-auto">
              {timeline.map((t: any) => (
                <li key={t.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{t.reason}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{fmtTime(t.out_time)} → {fmtTime(t.in_time)}</span>
                  </div>
                  {t.remarks && <p className="text-xs text-muted-foreground mt-1">{t.remarks}</p>}
                  <p className="text-sm font-semibold mt-1">
                    {t.duration_minutes != null ? `${t.duration_minutes}m` : <span className="text-warning">live · {liveDuration(t.out_time)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: "success" | "warning" }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent === "warning" ? "text-warning" : accent === "success" ? "text-success" : "text-gradient"}`}>{value}</p>
    </div>
  );
}