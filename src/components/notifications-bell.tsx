import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { useNotifications, AppNotification, NotificationPriority } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const priorityStyles: Record<NotificationPriority, { badge: string; ring: string; label: string }> = {
  info: { badge: "bg-primary/15 text-primary border-primary/20", ring: "", label: "Info" },
  warning: { badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20", ring: "ring-amber-500/40", label: "Warning" },
  urgent: { badge: "bg-destructive/15 text-destructive border-destructive/20", ring: "ring-destructive/40", label: "Urgent" },
};

export function NotificationsBell() {
  const { notifications, unread, readIds, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [popupId, setPopupId] = useState<string | null>(null);

  // Auto-open the next unread notification as a popup until it is read
  useEffect(() => {
    if (popupId) {
      const stillUnread = unread.find((n) => n.id === popupId);
      if (!stillUnread) setPopupId(null);
      return;
    }
    if (unread.length > 0) setPopupId(unread[0].id);
  }, [unread, popupId]);

  const popupNote = popupId ? notifications.find((n) => n.id === popupId) ?? null : null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
            {unread.length > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            {unread.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                {unread.length > 99 ? "99+" : unread.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-[11px] text-muted-foreground">
                {unread.length > 0 ? `${unread.length} unread` : "All caught up"}
              </p>
            </div>
            {unread.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => markAllRead()}>
                Mark all read
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-[420px]">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => {
                  const isUnread = !readIds.has(n.id);
                  const styles = priorityStyles[n.priority];
                  return (
                    <li key={n.id} className={cn("p-3 flex gap-3", isUnread && "bg-accent/30")}>
                      <div className={cn("h-2 w-2 mt-2 rounded-full shrink-0", isUnread ? "bg-primary" : "bg-transparent")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5", styles.badge)}>
                            {styles.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{n.message}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            {n.scope === "department" && n.department ? ` • ${n.department}` : ""}
                          </p>
                          {isUnread && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => markRead(n.id)}>
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={!!popupNote} onOpenChange={(v) => { if (!v && popupNote) markRead(popupNote.id); }}>
        <DialogContent className={cn("sm:max-w-md", popupNote && priorityStyles[popupNote.priority].ring && `ring-2 ${priorityStyles[popupNote.priority].ring}`)}>
          {popupNote && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", priorityStyles[popupNote.priority].badge)}>
                    {priorityStyles[popupNote.priority].label}
                  </Badge>
                  {popupNote.scope === "department" && popupNote.department && (
                    <Badge variant="secondary" className="text-[10px]">{popupNote.department}</Badge>
                  )}
                </div>
                <DialogTitle className="mt-2">{popupNote.title}</DialogTitle>
                <DialogDescription className="whitespace-pre-wrap break-words text-foreground/80">
                  {popupNote.message}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => markRead(popupNote.id)} className="gradient-primary text-primary-foreground border-0">
                  Mark as read
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}