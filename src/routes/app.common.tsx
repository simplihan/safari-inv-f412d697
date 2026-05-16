import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmtTime, fmtDuration, liveDuration } from "@/lib/format";
import { PieChart as PieIcon } from "lucide-react";

export const Route = createFileRoute("/app/common")({ component: Common });

const DUTY_MIN = 10 * 60; // 10 hours

type Row = {
  id: string;
  user_id: string;
  reason: string;
  remarks: string | null;
  out_time: string;
  in_time: string | null;
  duration_minutes: number | null;
  status: string;
  profile?: { full_name: string; department: string | null };
};

function Common() {
  const { user, profile, canManage } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [pieUserId, setPieUserId] = useState<string>("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data: logs } = await supabase
      .from("break_logs")
      .select("*")
      .gte("out_time", start.toISOString())
      .order("out_time", { ascending: false });
    const ids = Array.from(new Set((logs ?? []).map((l: any) => l.user_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, department").in("id", ids)
      : { data: [] as any[] };
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setRows(((logs ?? []) as Row[]).map((l) => ({ ...l, profile: pmap.get(l.user_id) })));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("common-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // people visible to me today (RLS already restricts to my dept unless I'm admin/manager)
  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dept: string | null }>();
    rows.forEach((r) => {
      if (!map.has(r.user_id)) {
        map.set(r.user_id, {
          id: r.user_id,
          name: r.profile?.full_name ?? "Unknown",
          dept: r.profile?.department ?? null,
        });
      }
    });
    if (user && profile && !map.has(user.id)) {
      map.set(user.id, { id: user.id, name: profile.full_name, dept: profile.department });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, user?.id, profile?.full_name, profile?.department]);

  useEffect(() => {
    if (!pieUserId && user?.id) setPieUserId(user.id);
  }, [user?.id, pieUserId]);

  const breakMinFor = (uid: string) => {
    let m = 0;
    rows.filter((r) => r.user_id === uid).forEach((r) => {
      if (r.duration_minutes != null) m += r.duration_minutes;
      else if (r.status === "out")
        m += Math.max(0, Math.round((Date.now() - new Date(r.out_time).getTime()) / 60000));
    });
    return m;
  };

  const selectedBreakMin = useMemo(
    () => (pieUserId ? breakMinFor(pieUserId) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pieUserId, rows, tick]
  );
  const selectedName =
    people.find((p) => p.id === pieUserId)?.name ?? profile?.full_name ?? "—";
  const workingMin = Math.max(0, DUTY_MIN - selectedBreakMin);
  const overMin = selectedBreakMin > DUTY_MIN ? selectedBreakMin - DUTY_MIN : 0;

  const pieData = [
    { name: "Working time", value: workingMin },
    { name: "Break / Outside", value: Math.min(selectedBreakMin, DUTY_MIN) },
    ...(overMin > 0 ? [{ name: "Over 10h", value: overMin }] : []),
  ].filter((d) => d.value > 0);

  const COLORS = ["#6366f1", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Common dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {canManage
              ? "Today's activity across all departments"
              : `Today's activity — ${profile?.department ?? "your"} department`}
          </p>
        </div>
        <Button onClick={() => setShowChart((s) => !s)} className="gradient-primary text-primary-foreground border-0">
          <PieIcon className="h-4 w-4 mr-2" /> {showChart ? "Hide" : "Show"} 10h breakdown
        </Button>
      </div>

      {showChart && (
        <Card className="glass-strong">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle>
              {selectedName} — {fmtDuration(selectedBreakMin)} on breaks · {fmtDuration(workingMin)} working
            </CardTitle>
            <div className="w-full md:w-64">
              <Select value={pieUserId} onValueChange={setPieUserId}>
                <SelectTrigger><SelectValue placeholder="Pick a person" /></SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.dept ? ` · ${p.dept}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtDuration(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass">
        <CardHeader><CardTitle>Today's activity feed</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No activity yet today.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                      {(r.profile?.full_name ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">{r.profile?.full_name ?? "Unknown"}</p>
                      <Badge variant="secondary">{r.reason}</Badge>
                      {r.status === "out" && <Badge className="bg-warning/20 text-foreground border-warning/40">Live</Badge>}
                      {r.profile?.department && <span className="text-xs text-muted-foreground">· {r.profile.department}</span>}
                    </div>
                    {r.remarks && <p className="text-xs text-muted-foreground mt-0.5">"{r.remarks}"</p>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-mono text-xs">{fmtTime(r.out_time)} → {fmtTime(r.in_time)}</p>
                    <p className="text-muted-foreground">
                      {r.duration_minutes != null ? fmtDuration(r.duration_minutes) : <span className="tabular-nums">{liveDuration(r.out_time)}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}