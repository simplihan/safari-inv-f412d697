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
import { Search, Pencil, UserPlus, KeyRound, Power, ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser, adminResetPassword, adminSetRoles, adminSetActive, adminUpdateEmail, adminSetDepartments } from "@/lib/users.functions";
import { useDepartments } from "@/hooks/use-departments";

export const Route = createFileRoute("/app/staff")({ component: Staff });

function Staff() {
  const { canManage, isAdmin, isManager, hasPermission } = useAuth();
  const allowed = canManage || hasPermission("manage_staff");
  const canEdit = isAdmin || isManager || hasPermission("manage_staff");
  const setActive = useServerFn(adminSetActive);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [permTarget, setPermTarget] = useState<any | null>(null);

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
  if (!allowed) return <Navigate to="/app/dashboard" />;

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
                <Button size="sm" variant="outline" onClick={() => setPermTarget(r)}>
                  <ShieldCheck className="h-4 w-4 mr-1" /> Permissions
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
      <EditDialog user={editing} onClose={() => setEditing(null)} onSaved={load} isAdmin={isAdmin} canEditEmail={isAdmin || isManager} />
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={load} />}
      {permTarget && <PermissionsDialog user={permTarget} onClose={() => setPermTarget(null)} />}
    </div>
  );
}

function EditDialog({ user, onClose, onSaved, isAdmin, canEditEmail }: any) {
  const [form, setForm] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>(["staff"]);
  const [newPwd, setNewPwd] = useState("");
  const [extraDepts, setExtraDepts] = useState<string[]>([]);
  const [origEmail, setOrigEmail] = useState<string>("");
  const [origDepts, setOrigDepts] = useState<string[]>([]);
  const resetPwd = useServerFn(adminResetPassword);
  const setRolesFn = useServerFn(adminSetRoles);
  const updateEmailFn = useServerFn(adminUpdateEmail);
  const setDeptsFn = useServerFn(adminSetDepartments);
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
      setOrigEmail(user.email ?? "");
      // Load multi-department assignments
      supabase
        .from("user_departments")
        .select("department")
        .eq("user_id", user.id)
        .then(({ data }) => {
          const list = (data ?? []).map((r: any) => r.department);
          // Make sure primary department is included
          if (user.department && !list.includes(user.department)) list.push(user.department);
          setExtraDepts(list);
          setOrigDepts([...list].sort());
        });
    }
  }, [user]);
  if (!user || !form) return null;
  const toggleRole = (r: string) => {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  };
  const toggleDept = (d: string) => {
    setExtraDepts((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };
  const save = async () => {
    const { email: newEmail, ...patch } = form;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) return toast.error(friendlyError(error));
    // Email change (admin or manager)
    if (canEditEmail && newEmail && newEmail !== origEmail) {
      try {
        await updateEmailFn({ data: { user_id: user.id, email: newEmail } });
      } catch (e: any) {
        return toast.error(friendlyError(e));
      }
    }
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
      // Department assignments
      const deptSorted = [...extraDepts].sort().join(",");
      const deptOrig = origDepts.join(",");
      if (deptSorted !== deptOrig) {
        if (extraDepts.length === 0) return toast.error("Assign at least one department");
        try {
          await setDeptsFn({ data: { user_id: user.id, departments: extraDepts } });
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
          <div className="col-span-2">
            <Label>Email {canEditEmail ? "" : "(read-only)"}</Label>
            <Input
              type="email"
              value={form.email ?? ""}
              disabled={!canEditEmail}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
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
            <div className="col-span-2">
              <Label>Departments (multi-select)</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {deptNames.map((d) => (
                  <label key={d} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                    <Checkbox checked={extraDepts.includes(d)} onCheckedChange={() => toggleDept(d)} />
                    <span className="text-sm">{d}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">The first selected department is used as the primary.</p>
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
const PERMISSION_LABELS: { key: string; label: string; desc: string }[] = [
  { key: "view_reports", label: "View Reports", desc: "Access the Reports & Analytics page." },
  { key: "view_monthly", label: "View Monthly Reports", desc: "Access the Monthly Reports page." },
  { key: "view_monitoring", label: "View Live Monitoring", desc: "See the live activity board." },
  { key: "view_pending", label: "View Pending Requests", desc: "See and approve new user requests." },
  { key: "manage_staff", label: "Manage Staff", desc: "Open and edit the Staff Management page." },
  { key: "view_audit", label: "View Audit Log", desc: "Read the audit log." },
  { key: "send_notifications", label: "Send Notifications", desc: "Create global or department notifications." },
  { key: "manage_chat_settings", label: "Manage Chat Settings", desc: "Toggle department chat availability." },
  { key: "cross_department", label: "Cross-Department Access", desc: "See users from any department (global scope only)." },
];

function PermissionsDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const [rows, setRows] = useState<{ permission: string; scope: "department" | "global"; access_level: "view" | "edit" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_permissions")
        .select("permission, scope, access_level")
        .eq("user_id", user.id);
      setRows(((data as any) ?? []).map((r: any) => ({
        permission: r.permission,
        scope: r.scope,
        access_level: (r.access_level ?? "view") as "view" | "edit",
      })));
      setLoading(false);
    })();
  }, [user.id]);

  const has = (k: string) => rows.find((r) => r.permission === k);
  const toggle = (k: string) => {
    setRows((prev) =>
      prev.some((r) => r.permission === k)
        ? prev.filter((r) => r.permission !== k)
        : [...prev, { permission: k, scope: "global", access_level: "view" }]
    );
  };
  const setScope = (k: string, scope: "department" | "global") => {
    setRows((prev) => prev.map((r) => (r.permission === k ? { ...r, scope } : r)));
  };
  const setLevel = (k: string, access_level: "view" | "edit") => {
    setRows((prev) => prev.map((r) => (r.permission === k ? { ...r, access_level } : r)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error: delErr } = await supabase.from("user_permissions").delete().eq("user_id", user.id);
      if (delErr) throw delErr;
      if (rows.length) {
        const payload = rows.map((r) => ({
          user_id: user.id,
          permission: r.permission as any,
          scope: r.scope as any,
          access_level: r.access_level as any,
        }));
        const { error } = await supabase.from("user_permissions").insert(payload);
        if (error) throw error;
      }
      toast.success("Permissions updated");
      onClose();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Individual permissions — {user.full_name}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Extra capabilities granted on top of the user's role. Role permissions remain unchanged.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-2">
            {PERMISSION_LABELS.map((p) => {
              const active = has(p.key);
              return (
                <div key={p.key} className="rounded-md border border-border p-3 flex items-start gap-3">
                  <Checkbox
                    checked={!!active}
                    onCheckedChange={() => toggle(p.key)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  {active && p.key !== "cross_department" && (
                    <div className="flex gap-2">
                      <Select
                        value={active.access_level}
                        onValueChange={(v: "view" | "edit") => setLevel(p.key, v)}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="edit">Edit</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={active.scope}
                        onValueChange={(v: "department" | "global") => setScope(p.key, v)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="department">Department</SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading} className="gradient-primary text-primary-foreground border-0">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
