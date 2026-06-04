import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDepartments } from "@/hooks/use-departments";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Check, X, Building2, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const { isAdmin } = useAuth();
  const { departments, reload } = useDepartments();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailFlags, setEmailFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("departments")
      .select("id, monthly_report_email")
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data ?? []).forEach((d: any) => { map[d.id] = !!d.monthly_report_email; });
        setEmailFlags(map);
      });
  }, [isAdmin, departments.length]);

  const toggleEmail = async (id: string, name: string, next: boolean) => {
    const prev = emailFlags[id];
    setEmailFlags((m) => ({ ...m, [id]: next }));
    const { error } = await supabase
      .from("departments")
      .update({ monthly_report_email: next })
      .eq("id", id);
    if (error) {
      setEmailFlags((m) => ({ ...m, [id]: prev }));
      return toast.error(friendlyError(error));
    }
    toast.success(`Monthly email ${next ? "enabled" : "disabled"} for ${name}`);
  };

  if (!isAdmin) return <Navigate to="/app/dashboard" />;

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from("departments").insert({ name });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Created "${name}"`);
    setNewName("");
    reload();
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from("departments").update({ name }).eq("id", editingId);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Renamed (members & chat settings updated)");
    setEditingId(null);
    reload();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const { error } = await supabase.from("departments").delete().eq("id", confirmDelete.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Deleted "${confirmDelete.name}"`);
    setConfirmDelete(null);
    reload();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
        <p className="text-muted-foreground mt-1">
          Create, rename, or remove departments. Renames automatically update every member and chat setting.
        </p>
      </div>

      <Card className="glass">
        <CardContent className="p-4 flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New department name"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button
            onClick={create}
            disabled={busy || !newName.trim()}
            className="gradient-primary text-primary-foreground border-0"
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {departments.map((d) => (
          <Card key={d.id} className="glass">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg gradient-primary grid place-items-center">
                <Building2 className="h-4 w-4 text-primary-foreground" />
              </div>
              {editingId === d.id ? (
                <>
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1"
                  />
                  <Button size="icon" variant="ghost" onClick={saveEdit} disabled={busy}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-medium flex-1">{d.name}</p>
                  <div className="flex items-center gap-2 mr-2" title="Send monthly report email to managers in this department">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label htmlFor={`email-${d.id}`} className="text-xs text-muted-foreground hidden sm:inline">
                      Monthly email
                    </Label>
                    <Switch
                      id={`email-${d.id}`}
                      checked={emailFlags[d.id] ?? true}
                      onCheckedChange={(v) => toggleEmail(d.id, d.name, v)}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => startEdit(d.id, d.name)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmDelete({ id: d.id, name: d.name })}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {departments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No departments yet — add one above.</p>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Members of this department will keep the name on their profile but won't match any active department until reassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}