import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/app/timeline")({ component: Timeline });

function Timeline() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from("break_logs").select("*").eq("user_id", user.id).order("out_time", { ascending: false }).limit(200).then(({ data }) => setRows(data ?? []));
  }, [user?.id]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My activity</h1>
        <p className="text-muted-foreground mt-1">Your last 200 sessions</p>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.reason}</Badge>
                    {r.status === "out" && <Badge className="bg-warning/20 text-foreground border-warning/40">Live</Badge>}
                  </div>
                  {r.remarks && <p className="text-xs text-muted-foreground mt-1">{r.remarks}</p>}
                </div>
                <div className="text-right text-sm">
                  <p className="font-mono text-xs">{fmtDateTime(r.out_time)}</p>
                  <p className="text-muted-foreground">{r.duration_minutes != null ? fmtDuration(r.duration_minutes) : "—"}</p>
                </div>
              </li>
            ))}
            {rows.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">No activity yet.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}