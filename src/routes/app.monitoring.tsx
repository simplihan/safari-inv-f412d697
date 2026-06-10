import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Activity, Play, Square, Pencil, Trash2 } from "lucide-react";
import { liveDuration, fmtTime } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { adminStartActivity, adminStopActivity, adminUpdateActivity, adminDeleteActivity } from "@/lib/activities.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { useAdminIds } from "@/hooks/use-admin-ids";
import { useVisibleIds } from "@/hooks/use-visible-ids";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/app/monitoring")({ component: Monitoring });

const REASONS = ["Break", "Lunch", "Prayer", "Shopping", "Meeting", "Other"] as const;

type Row = {
  id: string;
  full_name: string;
  department: string | null;
  profile_image: string | null;
  active?: { id: string; reason: string; out_time: string; remarks: string | null };
};

function Monitoring() {
  const { canManage, isAdmin } = useAuth();
  const adminIds = useAdminIds();
  const { ids: visibleIds } = useVisibleIds();
  const startFn = useServerFn(adminStartActivity);
  const stopFn = useServerFn(adminStopActivity);
  const updateFn = useServerFn(adminUpdateActivity);
  const deleteFn = useServerFn(adminDeleteActivity);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [tick, setTick] = useState(0);
  const [openUser, setOpenUser] = useState<Row | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<Row | null>(null);
  const [startReason, setStartReason] = useState<string>("Break");
  const [startRemarks, setStartRemarks] = useState("");
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editReason, setEditReason] = useState<string>("Break");
  const [editRemarks, setEditRemarks] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editIn, setEditIn] = useState("");

  const handleStop = async (activityId: string) => {
    setBusy(activityId);
    try {
      await stopFn({ data: { activity_id: activityId } });
      toast.success("Activity stopped");
      await load();
      if (openUser) await openTimeline(openUser);
    } catch (e: any) {
      toast.error(friendlyError({ message: e?.message }));
    } finally {
      setBusy(null);
    }
  };

  const openStart = (r: Row) => {
    setStartTarget(r);
    setStartReason("Break");
    setStartRemarks("");
  };

  const handleStart = async () => {
    if (!startTarget) return;
    if (startReason === "Other" && !startRemarks.trim()) {
      return toast.error("Remarks are required when reason is Other.");
    }
    setBusy(startTarget.id);
    try {
      await startFn({ data: { user_id: startTarget.id, reason: startReason, remarks: startRemarks.trim() || null } });
      toast.success(`Started ${startReason} for ${startTarget.full_name}`);
      setStartTarget(null);
      await load();
    } catch (e: any) {
      toast.error(friendlyError({ message: e?.message }));
    } finally {
      setBusy(null);
    }
  };

  const toLocalInput = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openEdit = (t: any) => {
    setEditTarget(t);
    setEditReason(t.reason);
    setEditRemarks(t.remarks ?? "");
    setEditOut(toLocalInput(t.out_time));
    setEditIn(toLocalInput(t.in_time));
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setBusy(editTarget.id);
    try {
      await updateFn({
        data: {
          activity_id: editTarget.id,
          reason: editReason as any,
          remarks: editRemarks.trim() || null,
          out_time: new Date(editOut).toISOString(),
          in_time: editIn ? new Date(editIn).toISOString() : null,
        },
      });
      toast.success("Activity updated");
      setEditTarget(null);
      await load();
      if (openUser) await openTimeline(openUser);
    } catch (e: any) {
      toast.error(friendlyError({ message: e?.message }));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this activity? This cannot be undone.")) return;
    setBusy(id);
    try {
      await deleteFn({ data: { activity_id: id } });
      toast.success("Activity deleted");
      await load();
      if (openUser) await openTimeline(openUser);
    } catch (e: any) {
      toast.error(friendlyError({ message: e?.message }));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    const { data: profiles } = await supabase.rpc("list_directory");
    const { data: open } = await supabase
      .from("break_logs")
      .select("id, user_id, reason, out_time, remarks")
      .eq("status", "out");
    const map = new Map((open ?? []).map((b: any) => [b.user_id, b]));
    setRows(
      ((profiles ?? []) as any[])
        .filter((p) => visibleIds.has(p.id))
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""))
        .map((p) => ({ ...p, active: map.get(p.id) })),
    );
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("mon-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "break_logs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [visibleIds]);

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
                  {canManage && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.active!.id}
                        onClick={(e) => { e.stopPropagation(); handleStop(r.active!.id); }}
                      >
                        <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
                      </Button>
                    </div>
                  )}
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
                {canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); openStart(r); }}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-success" />
                )}
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
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {t.duration_minutes != null ? `${t.duration_minutes}m` : <span className="text-warning">live · {liveDuration(t.out_time)}</span>}
                    </p>
                    {canManage && t.status === "out" && (
                      <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => handleStop(t.id)}>
                        <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
                      </Button>
                    )}
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" disabled={busy === t.id} onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" disabled={busy === t.id} onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Edit activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={editReason} onValueChange={setEditReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Out time</Label>
                <Input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>In time (blank = still out)</Label>
                <Input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Remarks</Label>
              <Textarea value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} rows={2} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={busy === editTarget?.id} className="gradient-primary text-primary-foreground border-0">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!startTarget} onOpenChange={(o) => !o && setStartTarget(null)}>
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>Start activity — {startTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={startReason} onValueChange={setStartReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              {startReason === "Lunch" && (
                <p className="text-xs text-muted-foreground mt-1">Lunch is exempt from the 5-person concurrent limit.</p>
              )}
            </div>
            <div>
              <Label>Remarks {startReason === "Other" && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={2}
                placeholder={startReason === "Other" ? "Required" : "Optional"}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStartTarget(null)}>Cancel</Button>
              <Button onClick={handleStart} disabled={busy === startTarget?.id} className="gradient-primary text-primary-foreground border-0">
                <Play className="h-3.5 w-3.5 mr-1.5" /> Start
              </Button>
            </div>
          </div>
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