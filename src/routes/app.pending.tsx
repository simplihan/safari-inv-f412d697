import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/pending")({ component: Pending });

function Pending() {
  const { canManage, hasPermission } = useAuth();
  const allowed = canManage || hasPermission("view_pending");
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("status", "pending").order("created_at", { ascending: false });
    setRows(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("pending")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "status=eq.pending" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "status=eq.approved" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "status=eq.rejected" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!allowed) return <Navigate to="/app/dashboard" />;

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success(`User ${status}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pending requests</h1>
        <p className="text-muted-foreground mt-1">{rows.length} awaiting your review</p>
      </div>
      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.id} className="glass">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{r.full_name}</h3>
                  <Badge variant="outline">SGC: {r.sgc_id ?? "—"}</Badge>
                  <Badge variant="secondary">{r.department ?? "—"}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{r.email}</span>
                  {r.mobile && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{r.mobile}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button size="sm" className="gradient-primary text-primary-foreground border-0" onClick={() => decide(r.id, "approved")}>
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No pending requests.</p>}
      </div>
    </div>
  );
}