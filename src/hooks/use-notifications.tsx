import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

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
  desktopPermission: NotificationPermission | "unsupported";
  requestDesktopPermission: () => Promise<NotificationPermission | "unsupported">;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => Promise<void>;
}

const NotifCtx = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("default");
  const desktopPermissionRef = useRef<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    const permission = typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
    setDesktopPermission(permission);
    desktopPermissionRef.current = permission;
  }, []);

  const requestDesktopPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setDesktopPermission("unsupported");
      desktopPermissionRef.current = "unsupported";
      return "unsupported";
    }

    const permission = await Notification.requestPermission();
    setDesktopPermission(permission);
    desktopPermissionRef.current = permission;
    return permission;
  }, []);

  const showDesktopNotification = useCallback((notification: AppNotification) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (desktopPermissionRef.current !== "granted") return;

    const desktopNotification = new Notification(notification.title, {
      body: notification.message,
      tag: notification.id,
      renotify: true,
    });

    desktopNotification.onclick = () => {
      window.focus();
      desktopNotification.close();
    };
  }, []);

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
    const channelName = `notifications-watch:${user.id}`;
    const ch = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as AppNotification;
        // Optimistic prepend so the bell + popup update instantly
        setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
        // Live toast so a new broadcast is always visible even if the popup is dismissed
        toast(n.title, { description: n.message });
        showDesktopNotification(n);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load, showDesktopNotification]);

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
    <NotifCtx.Provider
      value={{
        notifications,
        readIds,
        unread,
        loading,
        desktopPermission,
        requestDesktopPermission,
        markRead,
        markAllRead,
        reload: load,
      }}
    >
      {children}
    </NotifCtx.Provider>
  );
}

export function useNotifications() {
  const c = useContext(NotifCtx);
  if (!c) throw new Error("useNotifications must be used inside NotificationsProvider");
  return c;
}