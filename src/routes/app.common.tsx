import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmtTime, fmtDuration, liveDuration } from "@/lib/format";
import { PieChart as PieIcon, Trophy, Clock } from "lucide-react";
import { useAdminIds } from "@/hooks/use-admin-ids";

export const Route = createFileRoute("/app/common")({ component: Common });

const DUTY_MIN_PER_DAY = 10 * 60; // 10 hours
type Period = "day" | "week" | "month";

type Row = {
  id: string;
  user_id: string;
  reason: string;
  remarks: string | null;
  out_time: string;
  in_time: string | null;
  duration_minutes: number | null;
  status: string;
  profile?: { full_name: string; department: string | null; profile_image: string | null };
};

function Common() {
  const { user, profile, canManage } = useAuth();
  const adminIds = useAdminIds();
  const [rows, setRows] = useState<Row[]>([]);
  const [chartRows, setChartRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<Period>("day");
  const [chartDuty, setChartDuty] = useState<number>(DUTY_MIN_PER_DAY);
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
    const filteredLogs = (logs ?? []).filter((l: any) => !adminIds.has(l.user_id));
    const ids = Array.from(new Set(filteredLogs.map((l: any) => l.user_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, department, profile_image").in("id", ids)
      : { data: [] as any[] };
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setRows((filteredLogs as Row[]).map((l) => ({ ...l, profile: pmap.get(l.user_id) })));
  };

  // Load chart data scoped to the selected period (day/week/month)
  const loadChart = async () => {
    const now = new Date();
    const start = new Date(now);
    let days = 1;
    if (period === "day") { start.setHours(0, 0, 0, 0); days = 1; }
    else if (period === "week") { start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); days = 7; }
    else { start.setDate(now.getDate() - 29); start.setHours(0, 0, 0, 0); days = 30; }
    setChartDuty(DUTY_MIN_PER_DAY * days);
    const { data: logs } = await supabase
      .from("break_logs").select("*")
      .gte("out_time", start.toISOString())
      .order("out_time", { ascending: false });
    const list = ((logs ?? []) as Row[]).filter((l) => !adminIds.has(l.user_id));
    // Hydrate profiles for everyone in this chart range so the user picker
    // never shows "Unknown".
    const ids = Array.from(new Set(list.map((l) => l.user_id)));
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, full_name, department, profile_image").in("id", ids)
      : { data: [] as any[] };
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setChartRows(list.map((l) => ({ ...l, profile: pmap.get(l.user_id) })));
  };
  useEffect(() => { loadChart(); }, [period, adminIds]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("common-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, () => { load(); loadChart(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [adminIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // people visible to me (combine activity feed + chart data so the selector covers the whole period)
  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; dept: string | null; img: string | null }>();
    [...rows, ...chartRows].forEach((r) => {
      if (!map.has(r.user_id)) {
        map.set(r.user_id, {
          id: r.user_id,
          name: r.profile?.full_name ?? "Unknown",
          dept: r.profile?.department ?? null,
          img: r.profile?.profile_image ?? null,
        });
      }
    });
    if (user && profile && !map.has(user.id)) {
      map.set(user.id, { id: user.id, name: profile.full_name, dept: profile.department, img: profile.profile_image });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, chartRows, user?.id, profile?.full_name, profile?.department, profile?.profile_image]);

  useEffect(() => {
    if (!pieUserId && user?.id) setPieUserId(user.id);
  }, [user?.id, pieUserId]);

  const breakMinFor = (uid: string) => {
    let m = 0;
    chartRows.filter((r) => r.user_id === uid).forEach((r) => {
      if (r.duration_minutes != null) m += r.duration_minutes;
      else if (r.status === "out")
        m += Math.max(0, Math.round((Date.now() - new Date(r.out_time).getTime()) / 60000));
    });
    return m;
  };

  const selectedBreakMin = useMemo(
    () => (pieUserId ? breakMinFor(pieUserId) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pieUserId, chartRows, tick]
  );
  const selectedName =
    people.find((p) => p.id === pieUserId)?.name ?? profile?.full_name ?? "—";
  const workingMin = Math.max(0, chartDuty - selectedBreakMin);
  const overMin = selectedBreakMin > chartDuty ? selectedBreakMin - chartDuty : 0;

  const pieData = [
    { name: "Working time", value: workingMin },
    { name: "Break / Outside", value: Math.min(selectedBreakMin, chartDuty) },
    ...(overMin > 0 ? [{ name: "Over quota", value: overMin }] : []),
  ].filter((d) => d.value > 0);

  const COLORS = ["#6366f1", "#f59e0b", "#ef4444"];

  // Performance overview — top performers (least break time) & most breaks (most break time)
  const overview = useMemo(() => {
    const perUser = new Map<string, { id: string; name: string; dept: string | null; img: string | null; breakMin: number }>();
    people.forEach((p) => {
      if (adminIds.has(p.id)) return;
      perUser.set(p.id, { ...p, breakMin: breakMinFor(p.id) });
    });
    const list = Array.from(perUser.values());
    const top = [...list].sort((a, b) => a.breakMin - b.breakMin).slice(0, 5);
    const most = [...list].sort((a, b) => b.breakMin - a.breakMin).slice(0, 5);
    return { top, most };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, chartRows, adminIds, chartDuty, tick]);

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
          <PieIcon className="h-4 w-4 mr-2" /> {showChart ? "Hide" : "Show"} breakdown
        </Button>
      </div>

      {showChart && (
        <Card className="glass-strong">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle>
              {selectedName} — {fmtDuration(selectedBreakMin)} on breaks · {fmtDuration(workingMin)} working
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                ({period === "day" ? "today" : period === "week" ? "last 7 days" : "last 30 days"})
              </span>
            </CardTitle>
            <div className="flex gap-2 w-full md:w-auto">
              <Select value={period} onValueChange={(v: Period) => setPeriod(v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Daily</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex-1 md:w-64">
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Performance overview
            <span className="text-xs text-muted-foreground font-normal">
              · {period === "day" ? "today" : period === "week" ? "last 7 days" : "last 30 days"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-success" /> Top performers
            </h3>
            {overview.top.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {overview.top.map((u, i) => (
                  <li key={u.id} className={`py-2 flex items-center gap-3 rounded-md px-2 -mx-2 ${i === 0 ? 'bg-success/10' : i === 1 ? 'bg-success/5' : ''}`}>
                    <span className={`w-5 text-xs font-bold ${i === 0 ? 'text-success' : i === 1 ? 'text-success/70' : 'text-muted-foreground'}`}>#{i + 1}</span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.img ?? undefined} />
                      <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                        {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      {u.dept && <p className="text-xs text-muted-foreground truncate">{u.dept}</p>}
                    </div>
                    <Badge className={`text-xs ${i === 0 ? 'bg-success/20 text-success border-success/40 hover:bg-success/30' : 'bg-secondary text-secondary-foreground'}`}>
                      {fmtDuration(Math.max(0, chartDuty - u.breakMin))} working
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" /> Most breaks
            </h3>
            {overview.most.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No data yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {overview.most.map((u, i) => (
                  <li key={u.id} className={`py-2 flex items-center gap-3 rounded-md px-2 -mx-2 ${i === 0 ? 'bg-destructive/10' : i === 1 ? 'bg-destructive/5' : ''}`}>
                    <span className={`w-5 text-xs font-bold ${i === 0 ? 'text-destructive' : i === 1 ? 'text-destructive/70' : 'text-muted-foreground'}`}>#{i + 1}</span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.img ?? undefined} />
                      <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                        {u.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      {u.dept && <p className="text-xs text-muted-foreground truncate">{u.dept}</p>}
                    </div>
                    <Badge className={`text-xs ${i === 0 ? 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive/30' : 'bg-secondary text-secondary-foreground'}`}>
                      {fmtDuration(u.breakMin)} break
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

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
                    <AvatarImage src={r.profile?.profile_image ?? undefined} />
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