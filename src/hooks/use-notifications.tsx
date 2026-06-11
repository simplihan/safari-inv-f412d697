import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type NotificationPriority = "info" | "warning" | "urgent";
export type NotificationScope = "global" | "department";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  scope: NotificationScope;
  department: string | null;
  created_by: string | null;
  created_at: string;
}

interface Ctx {
  notifications: AppNotification[];
  readIds: Set<string>;
  unread: AppNotification[];
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => Promise<void>;
}

const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setReadIds(new Set());
      setLoading(false);
      return;
    }
    const [{ data: notes }, { data: reads }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("notification_reads").select("notification_id").eq("user_id", user.id),
    ]);
    setNotifications((notes as AppNotification[]) ?? []);
    setReadIds(new Set(((reads as { notification_id: string }[]) ?? []).map((r) => r.notification_id)));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
    if (!user?.id) return;
    const ch = supabase
      .channel("notifications-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load, profile?.department]);

  const markRead = useCallback(
    async (id: string) => {
      if (!user?.id) return;
      setReadIds((prev) => new Set(prev).add(id));
      await supabase.from("notification_reads").insert({ notification_id: id, user_id: user.id }).then();
    },
    [user?.id],
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id) return;
    const unreadIds = notifications.filter((n) => !readIds.has(n.id)).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      unreadIds.forEach((id) => next.add(id));
      return next;
    });
    await supabase
      .from("notification_reads")
      .insert(unreadIds.map((id) => ({ notification_id: id, user_id: user.id })));
  }, [user?.id, notifications, readIds]);

  const unread = useMemo(() => notifications.filter((n) => !readIds.has(n.id)), [notifications, readIds]);

  return (
    <NotifCtx.Provider value={{ notifications, readIds, unread, loading, markRead, markAllRead, reload: load }}>
      {children}
    </NotifCtx.Provider>
  );
}

export function useNotifications() {
  const c = useContext(NotifCtx);
  if (!c) throw new Error("useNotifications must be used inside NotificationsProvider");
  return c;
}