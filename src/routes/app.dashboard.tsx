import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LogOut, LogIn, Clock, Activity, Coffee, Users as UsersIcon, CalendarDays, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { liveDuration, fmtDuration, fmtTime, reasonLabel, toDbReason } from "@/lib/format";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { CountryFlag } from "@/components/country-flag";
import { FESTIVALS } from "@/lib/festivals";

export const Route = createFileRoute("/app/dashboard")({ component: Dashboard });

const REASONS = ["Tea Break", "Lunch", "Prayer", "Shopping", "Meeting", "Other"] as const;

type BreakLog = {
  id: string;
  user_id: string;
  reason: string;
  remarks: string | null;
  out_time: string;
  in_time: string | null;
  duration_minutes: number | null;
  status: string;
};

function Dashboard() {
  const { user, profile, canManage } = useAuth();
  const [active, setActive] = useState<BreakLog | null>(null);
  const [today, setToday] = useState<BreakLog[]>([]);
  const [reason, setReason] = useState<string>("Tea Break");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const [outNow, setOutNow] = useState(0);
  const [logins, setLogins] = useState<any[]>([]);
  const [monthLogs, setMonthLogs] = useState<BreakLog[]>([]);
  const [upcoming, setUpcoming] = useState<{ name: string; country: string; emoji: string; date: Date }[]>([]);


  // tick for live timer
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    if (!user) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("break_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("out_time", start.toISOString())
      .order("out_time", { ascending: false });
    const list = (data ?? []) as BreakLog[];
    setToday(list);
    setActive(list.find((b) => b.status === "out") ?? null);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: mData } = await supabase
      .from("break_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("out_time", monthStart.toISOString())
      .order("out_time", { ascending: false });
    setMonthLogs((mData ?? []) as BreakLog[]);

    if (canManage) {
      const { count } = await supabase
        .from("break_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "out");
      setOutNow(count ?? 0);
    }
  };

  // Upcoming festivals (next 60 days)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("festivals")
        .select("name, country, emoji, dates, active")
        .eq("active", true);
      if (cancelled) return;
      const source =
        data && data.length
          ? (data as any[])
          : FESTIVALS.map((f) => ({ name: f.name, country: f.country, emoji: f.emoji, dates: f.dates }));
      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);
      const horizon = new Date(today0.getTime() + 60 * 86400000);
      const out: { name: string; country: string; emoji: string; date: Date }[] = [];
      for (const f of source) {
        for (const raw of (f.dates ?? []) as string[]) {
          const candidates = raw.length === 5
            ? [`${today0.getFullYear()}-${raw}`, `${today0.getFullYear() + 1}-${raw}`]
            : [raw];
          for (const c of candidates) {
            const [y, m, d] = c.split("-").map(Number);
            if (!y || !m || !d) continue;
            const dt = new Date(y, m - 1, d);
            if (dt >= today0 && dt <= horizon) out.push({ name: f.name, country: f.country, emoji: f.emoji, date: dt });
          }
        }
      }
      out.sort((a, b) => a.date.getTime() - b.date.getTime());
      setUpcoming(out.slice(0, 3));
    })();
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    load();
    if (user) {
      supabase
        .from("login_events")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5)
        .then(({ data }) => setLogins(data ?? []));
    }
    const ch = supabase
      .channel("breaks-self")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const goOut = async () => {
    if (!user) return;
    if (reason === "Other" && !remarks.trim()) {
      return toast.error("Remarks are required when reason is Other.");
    }
    setSubmitting(true);
    const { error } = await supabase.from("break_logs").insert({
      user_id: user.id,
      reason: toDbReason(reason) as any,
      remarks: remarks.trim() || null,
      out_time: new Date().toISOString(),
      status: "out",
    });
    setSubmitting(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Marked OUT — ${reason}`);
    setRemarks("");
    setReason("Tea Break");
  };

  const goIn = async () => {
    if (!active) return;
    setSubmitting(true);
    const inTime = new Date();
    const dur = Math.max(1, Math.round((inTime.getTime() - new Date(active.out_time).getTime()) / 60000));
    const { data: updated, error } = await supabase
      .from("break_logs")
      .update({ in_time: inTime.toISOString(), duration_minutes: dur, status: "in" })
      .eq("id", active.id)
      .eq("status", "out")
      .select("id");
    setSubmitting(false);
    if (error) return toast.error(friendlyError(error));
    if (!updated || updated.length === 0) {
      toast.info("This break was auto-closed after 2 hours.");
      await load();
      return;
    }
    toast.success(`Welcome back — ${dur}m out`);
  };

  const totalMinToday = today.filter((t) => t.duration_minutes).reduce((s, t) => s + (t.duration_minutes ?? 0), 0);

  const monthSummary = useMemo(() => {
    const nonFriday = monthLogs.filter((b) => new Date(b.out_time).getDay() !== 5);
    const totalMin = nonFriday.reduce((s, b) => s + (b.duration_minutes ?? 0), 0);
    const days = new Set(nonFriday.map((b) => new Date(b.out_time).toDateString()));
    const activeDays = days.size;
    return { totalMin, activeDays, avg: activeDays ? Math.round(totalMin / activeDays) : 0 };
  }, [monthLogs]);


  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">Hi {profile?.full_name?.split(" ")[0]}</p>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Today's activity</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Activity}
          label="Status"
          value={active ? "OUT" : "IN"}
          accent={active ? "warning" : "success"}
        />
        <StatCard icon={Clock} label="Time out today" value={fmtDuration(totalMinToday)} />
        <StatCard icon={Coffee} label="Sessions today" value={String(today.length)} />
      </div>

      {/* OUT/IN action card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="glass-strong border-border">
          <CardHeader>
            <CardTitle>{active ? "You are currently OUT" : "Step out"}</CardTitle>
          </CardHeader>
          <CardContent>
            {active ? (
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className="gradient-primary text-primary-foreground border-0">{reasonLabel(active.reason)}</Badge>
                    <span className="text-sm text-muted-foreground">since {fmtTime(active.out_time)}</span>
                  </div>
                  {active.remarks && <p className="mt-2 text-sm text-muted-foreground">"{active.remarks}"</p>}
                  <p className="mt-4 text-4xl font-bold tabular-nums text-gradient animate-pulse" key={tick}>
                    {liveDuration(active.out_time)}
                  </p>
                </div>
                <Button
                  onClick={goIn}
                  disabled={submitting}
                  size="lg"
                  className="gradient-primary text-primary-foreground border-0 shadow-lg"
                >
                  <LogIn className="h-4 w-4 mr-2" /> Mark IN
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Reason</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Remarks {reason === "Other" && <span className="text-destructive">*</span>}</Label>
                  <Textarea
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={1}
                    placeholder={reason === "Other" ? "Required" : "Optional"}
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={goOut}
                  disabled={submitting}
                  size="lg"
                  className="md:col-span-2 gradient-primary text-primary-foreground border-0 shadow-lg"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Mark OUT
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Monthly summary */}
      <Card className="glass border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> This month's summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total time logged</p>
            <p className="text-2xl font-bold mt-1">{fmtDuration(monthSummary.totalMin)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {monthSummary.activeDays} active {monthSummary.activeDays === 1 ? "day" : "days"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Average per day</p>
            <p className="text-2xl font-bold mt-1">{fmtDuration(monthSummary.avg)}</p>
            <p className="text-xs text-muted-foreground mt-1">Based on your active days</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <PartyPopper className="h-3.5 w-3.5" /> Upcoming festivals
            </p>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">None in the next 60 days.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {upcoming.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                    <CountryFlag country={f.country} className="inline-block h-4 w-6 shrink-0 rounded-sm border border-border" />
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                      {f.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {canManage && (

        <Card className="glass border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4" /> Team snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-gradient">{outNow}</p>
            <p className="text-sm text-muted-foreground">people currently out</p>
          </CardContent>
        </Card>
      )}

      {/* Today's sessions */}
      <Card className="glass border-border">
        <CardHeader>
          <CardTitle>Today's sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No breaks yet today.</p>
          ) : (
            <ul className="divide-y divide-border">
              {today.map((b) => (
                <li key={b.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{reasonLabel(b.reason)}</Badge>
                      {b.status === "out" && (
                        <Badge className="bg-warning/20 text-foreground border-warning/40">Live</Badge>
                      )}
                    </div>
                    {b.remarks && <p className="text-xs text-muted-foreground mt-1">{b.remarks}</p>}
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-mono">
                      {fmtTime(b.out_time)} → {fmtTime(b.in_time)}
                    </p>
                    <p className="text-muted-foreground">
                      {b.duration_minutes != null ? (
                        fmtDuration(b.duration_minutes)
                      ) : (
                        <span className="tabular-nums">{liveDuration(b.out_time)}</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="glass border-border">
        <CardHeader>
          <CardTitle>Recent sign-ins</CardTitle>
        </CardHeader>
        <CardContent>
          {logins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No recent sign-ins recorded.</p>
          ) : (
            <ul className="divide-y divide-border">
              {logins.map((l: any) => {
                const Icon = l.device === "Mobile" ? Smartphone : l.device === "Tablet" ? Tablet : Monitor;
                return (
                  <li key={l.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {l.os ?? "—"} · {l.browser ?? "—"}
                        <span className="text-muted-foreground"> · {l.device ?? "—"}</span>
                      </span>
                    </div>
                    <div className="text-right text-muted-foreground">
                      <p className="font-mono text-xs">{l.ip ?? "—"}</p>
                      <p className="text-[11px]">{new Date(l.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: "success" | "warning";
}) {
  return (
    <div className="glass rounded-2xl p-5 flex items-center gap-4">
      <div
        className={`h-12 w-12 rounded-xl grid place-items-center ${accent === "warning" ? "bg-warning/20" : accent === "success" ? "bg-success/20" : "gradient-primary"}`}
      >
        <Icon className={`h-5 w-5 ${accent ? "text-foreground" : "text-primary-foreground"}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
