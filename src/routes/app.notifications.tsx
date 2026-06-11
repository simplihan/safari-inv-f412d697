import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDepartments } from "@/hooks/use-departments";
import { friendlyError } from "@/lib/friendly-error";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Trash2 } from "lucide-react";
import type { AppNotification, NotificationPriority, NotificationScope } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/notifications")({ component: NotificationsAdmin });

const priorityClass: Record<NotificationPriority, string> = {
  info: "bg-primary/15 text-primary border-primary/20",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  urgent: "bg-destructive/15 text-destructive border-destructive/20",
};

function NotificationsAdmin() {
  const { canManage, isAdmin, profile, user } = useAuth();
  const { names: deptNames } = useDepartments();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<NotificationPriority>("info");
  const [scope, setScope] = useState<NotificationScope>("global");
  const [department, setDepartment] = useState<string>(profile?.department ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (profile?.department && !department) setDepartment(profile.department);
  }, [profile?.department, department]);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as AppNotification[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("notifications-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!canManage) return <Navigate to="/app/dashboard" />;

  const submit = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (scope === "department" && !department) {
      toast.error("Choose a department");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      message: message.trim(),
      priority,
      scope,
      department: scope === "department" ? department : null,
      created_by: user?.id ?? null,
    } as any);
    setSubmitting(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Notification sent");
    setTitle("");
    setMessage("");
    setPriority("info");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) return toast.error(friendlyError(error));
    toast.success("Deleted");
  };

  // Managers can only target their own department or global; admins anywhere
  const allowedDepartments = isAdmin ? deptNames : deptNames.filter((d) => d === profile?.department);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-primary grid place-items-center">
          <Megaphone className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Broadcast announcements to all users or a specific department.</p>
        </div>
      </div>

      <Card className="glass">
        <CardHeader><CardTitle>New notification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="System maintenance tonight" maxLength={120} />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Details users should know..." rows={4} maxLength={1000} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as NotificationPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as NotificationScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Everyone</SelectItem>
                  <SelectItem value="department">Specific department</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "department" && (
              <div>
                <Label>Department</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {allowedDepartments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <Button onClick={submit} disabled={submitting} className="gradient-primary text-primary-foreground border-0">
            {submitting ? "Sending..." : "Send notification"}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><CardTitle>Recent notifications</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const canDelete = isAdmin || n.created_by === user?.id;
                return (
                  <li key={n.id} className="py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{n.title}</p>
                        <Badge variant="outline" className={cn("text-[10px]", priorityClass[n.priority])}>
                          {n.priority}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {n.scope === "global" ? "Everyone" : n.department}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => remove(n.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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