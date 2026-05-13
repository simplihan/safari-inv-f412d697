import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/staff")({ component: Staff });

function Staff() {
  const { canManage, isAdmin } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role); roleMap.set(r.user_id, arr);
    });
    setRows((profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] })));
  };

  useEffect(() => { load(); }, []);
  if (!canManage) return <Navigate to="/app/dashboard" />;

  const filtered = rows.filter((r) =>
    !q || r.full_name?.toLowerCase().includes(q.toLowerCase()) || r.email?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff management</h1>
          <p className="text-muted-foreground mt-1">{rows.length} total members</p>
        </div>
        <div className="relative md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="pl-9" />
        </div>
      </div>
      <div className="grid gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="glass">
            <CardContent className="p-4 flex items-center gap-4">
              <Avatar className="h-11 w-11">
                <AvatarImage src={r.profile_image ?? undefined} />
                <AvatarFallback className="gradient-primary text-primary-foreground">
                  {r.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.full_name}</p>
                  <Badge variant="outline">{r.sgc_id}</Badge>
                  {r.roles.map((rl: string) => <Badge key={rl} variant="secondary" className="capitalize">{rl}</Badge>)}
                  <Badge className={
                    r.status === "approved" ? "bg-success/20 text-foreground border-success/40" :
                    r.status === "pending" ? "bg-warning/20 text-foreground border-warning/40" :
                    "bg-destructive/20 text-foreground border-destructive/40"
                  }>{r.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.email} · {r.department ?? "—"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <EditDialog user={editing} onClose={() => setEditing(null)} onSaved={load} canEditRole={isAdmin} />
    </div>
  );
}

function EditDialog({ user, onClose, onSaved, canEditRole }: any) {
  const [form, setForm] = useState<any>(null);
  const [role, setRole] = useState<string>("staff");
  useEffect(() => {
    if (user) {
      setForm({ full_name: user.full_name, sgc_id: user.sgc_id, department: user.department, mobile: user.mobile, status: user.status });
      setRole(user.roles?.[0] ?? "staff");
    }
  }, [user]);
  if (!user || !form) return null;
  const save = async () => {
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    if (error) return toast.error(error.message);
    if (canEditRole && role !== user.roles?.[0]) {
      await supabase.from("user_roles").delete().eq("user_id", user.id);
      await supabase.from("user_roles").insert({ user_id: user.id, role: role as any });
    }
    toast.success("Saved"); onSaved(); onClose();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong">
        <DialogHeader><DialogTitle>Edit {user.full_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>SGC ID</Label><Input value={form.sgc_id ?? ""} onChange={(e) => setForm({ ...form, sgc_id: e.target.value })} /></div>
          <div><Label>Department</Label><Input value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          <div><Label>Mobile</Label><Input value={form.mobile ?? ""} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canEditRole && (
            <div className="col-span-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="gradient-primary text-primary-foreground border-0">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}