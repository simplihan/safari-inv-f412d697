import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useVisibleIds } from "@/hooks/use-visible-ids";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/timeline")({ component: Timeline });

interface DirectoryEntry {
  id: string;
  full_name: string;
  department: string | null;
  profile_image: string | null;
}

function Timeline() {
  const { user, canManage } = useAuth();
  const { ids: visibleIds, ready } = useVisibleIds();
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [rows, setRows] = useState<any[]>([]);
  const [directory, setDirectory] = useState<Map<string, DirectoryEntry>>(new Map());
  const [search, setSearch] = useState("");

  // My activity
  useEffect(() => {
    if (!user) return;
    supabase.from("break_logs").select("*").eq("user_id", user.id).order("out_time", { ascending: false }).limit(200).then(({ data }) => setRows(data ?? []));
  }, [user?.id]);

  // Team activity (supervisors/managers/admins): department-scoped via RLS
  const [teamRows, setTeamRows] = useState<any[]>([]);
  useEffect(() => {
    if (!canManage || !user) return;
    supabase.from("break_logs").select("*").order("out_time", { ascending: false }).limit(500).then(({ data }) => setTeamRows(data ?? []));
    (supabase.rpc as unknown as (fn: string) => Promise<{ data: DirectoryEntry[] | null }>)("list_directory")
      .then(({ data }) => {
        const m = new Map<string, DirectoryEntry>();
        (data ?? []).forEach((d) => m.set(d.id, d));
        setDirectory(m);
      });
  }, [canManage, user?.id]);

  const filteredTeam = useMemo(() => {
    if (!ready) return [];
    const q = search.trim().toLowerCase();
    return teamRows.filter((r) => {
      if (!visibleIds.has(r.user_id)) return false;
      if (q) {
        const name = directory.get(r.user_id)?.full_name?.toLowerCase() ?? "";
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [teamRows, visibleIds, ready, search, directory]);

  const list = tab === "mine" ? rows : filteredTeam;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground mt-1">
          {tab === "mine" ? "Your last 200 sessions" : "Recent activity across your team"}
        </p>
      </div>

      {canManage && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("mine")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-all",
              tab === "mine" ? "gradient-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            My activity
          </button>
          <button
            onClick={() => setTab("team")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-all",
              tab === "team" ? "gradient-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
            )}
          >
            Team activity
          </button>
          {tab === "team" && (
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff by name…"
              className="ml-auto w-56"
            />
          )}
        </div>
      )}

      <Card className="glass">
        <CardHeader><CardTitle>{tab === "mine" ? "History" : "Team history"}</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {list.map((r) => {
              const person = tab === "team" ? directory.get(r.user_id) : undefined;
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {tab === "team" && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={person?.profile_image ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {person?.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">{person?.full_name ?? "Unknown user"}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{r.reason}</Badge>
                      {r.status === "out" && <Badge className="bg-warning/20 text-foreground border-warning/40">Live</Badge>}
                    </div>
                    {r.remarks && <p className="text-xs text-muted-foreground mt-1">{r.remarks}</p>}
                  </div>
                  <div className="text-right text-sm shrink-0">
                    <p className="font-mono text-xs">{fmtDateTime(r.out_time)}</p>
                    <p className="text-muted-foreground">{r.duration_minutes != null ? fmtDuration(r.duration_minutes) : "—"}</p>
                  </div>
                </li>
              );
            })}
            {list.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No activity yet.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
