import { friendlyError } from "@/lib/friendly-error";
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
import { Search, Pencil, UserPlus, KeyRound, Power } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser, adminResetPassword, adminSetRoles, adminSetActive } from "@/lib/users.functions";
import { useDepartments } from "@/hooks/use-departments";

export const Route = createFileRoute("/app/staff")({ component: Staff });

function Staff() {
  const { canManage, isAdmin, isManager } = useAuth();
  const canEdit = isAdmin || isManager;
  const setActive = useServerFn(adminSetActive);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

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

  const toggleActive = async (r: any) => {
    const active = r.status !== "approved";
    try {
      await setActive({ data: { user_id: r.id, active } });
      toast.success(active ? "User activated" : "User deactivated");
      load();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff management</h1>
          <p className="text-muted-foreground mt-1">{rows.length} total members</p>
        </div>
        <div className="flex gap-2 md:w-auto w-full">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="pl-9" />
          </div>
          {isAdmin && (
            <Button onClick={() => setCreating(true)} className="gradient-primary text-primary-foreground border-0">
              <UserPlus className="h-4 w-4 mr-2" /> Add user
            </Button>
          )}
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
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant={r.status === "approved" ? "outline" : "default"}
                  onClick={() => toggleActive(r)}
                  className={r.status === "approved" ? "" : "gradient-primary text-primary-foreground border-0"}
                >
                  <Power className="h-4 w-4 mr-1" />
                  {r.status === "approved" ? "Deactivate" : "Activate"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <EditDialog user={editing} onClose={() => setEditing(null)} onSaved={load} isAdmin={isAdmin} />
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={load} />}
    </div>
  );
}

function EditDialog({ user, onClose, onSaved, isAdmin }: any) {
  const [form, setForm] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>(["staff"]);
  const [newPwd, setNewPwd] = useState("");
  const resetPwd = useServerFn(adminResetPassword);
  const setRolesFn = useServerFn(adminSetRoles);
  const { names: deptNames } = useDepartments();
  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name,
        sgc_id: user.sgc_id,
        department: user.department,
        mobile: user.mobile,
        status: user.status,
        email: user.email,
      });
      setRoles(user.roles?.length ? user.roles : ["staff"]);
      setNewPwd("");
    }
  }, [user]);
  if (!user || !form) return null;
  const toggleRole = (r: string) => {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };
  const save = async () => {
    const { email: _ignore, ...patch } = form;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) return toast.error(friendlyError(error));
    if (isAdmin) {
      const sorted = [...roles].sort().join(",");
      const current = [...(user.roles ?? [])].sort().join(",");
      if (sorted !== current) {
        if (roles.length === 0) return toast.error("Assign at least one role");
        try {
          await setRolesFn({ data: { user_id: user.id, roles: roles as any } });
        } catch (e: any) {
          return toast.error(friendlyError(e));
        }
      }
    }
    toast.success("Saved"); onSaved(); onClose();
  };
  const doResetPwd = async () => {
    if (newPwd.length < 8) return toast.error("Password must be at least 8 chars");
    try {
      await resetPwd({ data: { user_id: user.id, password: newPwd } });
      toast.success("Password reset");
      setNewPwd("");
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit {user.full_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="col-span-2"><Label>Email</Label><Input value={form.email ?? ""} disabled /></div>
          <div><Label>SGC ID</Label><Input value={form.sgc_id ?? ""} onChange={(e) => setForm({ ...form, sgc_id: e.target.value })} /></div>
          <div>
            <Label>Department</Label>
            <Select value={form.department ?? ""} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
              <SelectContent>
                {deptNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          {isAdmin && (
            <div className="col-span-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(["admin", "manager", "supervisor", "staff"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                    <span className="capitalize text-sm">{r}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="col-span-2 border-t border-border pt-3 mt-1">
              <Label className="flex items-center gap-2"><KeyRound className="h-3.5 w-3.5" /> Reset password</Label>
              <div className="flex gap-2 mt-1">
                <Input type="password" placeholder="New password (min 8 chars)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                <Button variant="outline" onClick={doResetPwd} disabled={newPwd.length < 8}>Reset</Button>
              </div>
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

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createFn = useServerFn(adminCreateUser);
  const { names: deptNames } = useDepartments();
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", sgc_id: "", mobile: "",
    department: "Inventory",
    role: "staff" as "admin" | "manager" | "supervisor" | "staff",
    status: "approved" as "approved" | "pending" | "rejected",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.email || form.password.length < 8 || !form.full_name || !form.sgc_id) {
      return toast.error("Fill name, SGC, email and 8+ char password");
    }
    setBusy(true);
    try {
      await createFn({ data: { ...form, mobile: form.mobile || null } });
      toast.success("User created");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add new user</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>SGC ID</Label><Input value={form.sgc_id} onChange={(e) => setForm({ ...form, sgc_id: e.target.value })} /></div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="col-span-2"><Label>Initial password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8+ characters" /></div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onValueChange={(v: any) => setForm({ ...form, department: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{deptNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v: any) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gradient-primary text-primary-foreground border-0">
            {busy ? "Creating…" : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}