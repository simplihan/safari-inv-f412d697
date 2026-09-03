import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, Check, Minimize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { friendlyError } from "@/lib/friendly-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  snoozed_until: string | null;
  done: boolean;
};

/** Snooze window used by the "Minimize" action — reminds again every hour. */
const SNOOZE_MS = 60 * 60 * 1000;

function dueAt(r: Reminder) {
  return new Date(r.snoozed_until ?? r.remind_at).getTime();
}

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar reminders: add date/time/topic, popup on login, minimize (hourly) or complete. */
export function RemindersBell() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [popupId, setPopupId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    date: localInputValue(new Date()),
    time: "09:00",
  });

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("reminders")
      .select("id, title, notes, remind_at, snoozed_until, done")
      .eq("user_id", user.id)
      .eq("done", false)
      .order("remind_at", { ascending: true });
    if (error) return;
    setRows((data ?? []) as Reminder[]);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick every 30s so due reminders pop up without a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const due = useMemo(
    () => rows.filter((r) => !r.done && dueAt(r) <= now).sort((a, b) => dueAt(a) - dueAt(b)),
    [rows, now],
  );

  useEffect(() => {
    if (popupId && !due.some((r) => r.id === popupId)) setPopupId(null);
    if (!popupId && due.length) setPopupId(due[0].id);
  }, [due, popupId]);

  const popup = popupId ? rows.find((r) => r.id === popupId) ?? null : null;

  const add = async () => {
    if (!user) return;
    const title = form.title.trim();
    if (!title) return toast.error("Add a topic for the reminder");
    if (!form.date || !form.time) return toast.error("Pick a date and time");
    const when = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(when.getTime())) return toast.error("That date and time is not valid");
    setBusy(true);
    const { error } = await supabase
      .from("reminders")
      .insert({ user_id: user.id, title, remind_at: when.toISOString() });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Reminder added");
    setForm({ title: "", date: localInputValue(new Date()), time: "09:00" });
    setAdding(false);
    load();
  };

  const snooze = async (r: Reminder) => {
    const until = new Date(Date.now() + SNOOZE_MS).toISOString();
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, snoozed_until: until } : x)));
    setPopupId(null);
    const { error } = await supabase.from("reminders").update({ snoozed_until: until }).eq("id", r.id);
    if (error) toast.error(friendlyError(error));
    else toast("Minimized — you'll be reminded again in an hour");
  };

  const complete = async (r: Reminder) => {
    setRows((list) => list.filter((x) => x.id !== r.id));
    setPopupId(null);
    const { error } = await supabase.from("reminders").update({ done: true }).eq("id", r.id);
    if (error) {
      toast.error(friendlyError(error));
      load();
    }
  };

  const remove = async (r: Reminder) => {
    setRows((list) => list.filter((x) => x.id !== r.id));
    const { error } = await supabase.from("reminders").delete().eq("id", r.id);
    if (error) {
      toast.error(friendlyError(error));
      load();
    }
  };

  if (!user) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reminders"
            className="relative text-primary ring-1 ring-primary/30 bg-primary/10 hover:bg-primary/20"
          >
            <CalendarClock className="h-5 w-5" />
            {due.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                {due.length > 99 ? "99+" : due.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[340px] p-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div>
              <p className="text-sm font-semibold">Reminders</p>
              <p className="text-[11px] text-muted-foreground">
                {due.length > 0 ? `${due.length} due now` : `${rows.length} upcoming`}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>

          {adding && (
            <div className="p-3 space-y-2 border-b border-border">
              <div className="space-y-1">
                <Label className="text-xs">Topic</Label>
                <Input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Submit stock count"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Time</Label>
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                  />
                </div>
              </div>
              <Button
                onClick={add}
                disabled={busy}
                className="w-full gradient-primary text-primary-foreground border-0"
              >
                Save reminder
              </Button>
            </div>
          )}

          <ScrollArea className="max-h-[300px]">
            <div className="p-2 space-y-1">
              {rows.map((r) => {
                const isDue = dueAt(r) <= now;
                return (
                  <div
                    key={r.id}
                    className={`flex items-start gap-2 rounded-md p-2 ${isDue ? "bg-destructive/10" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.remind_at).toLocaleString()}
                        {r.snoozed_until ? " · minimized" : ""}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => complete(r)} title="Mark done">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove(r)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No reminders yet — add one above.
                </p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={!!popup} onOpenChange={(o) => { if (!o && popup) snooze(popup); }}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> Reminder
            </DialogTitle>
            <DialogDescription>
              {popup ? new Date(popup.remind_at).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-lg font-semibold">{popup?.title}</p>
          {popup?.notes && <p className="text-sm text-muted-foreground">{popup.notes}</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => popup && snooze(popup)}>
              <Minimize2 className="h-4 w-4 mr-1" /> Minimize (1 hour)
            </Button>
            <Button
              onClick={() => popup && complete(popup)}
              className="gradient-primary text-primary-foreground border-0"
            >
              <Check className="h-4 w-4 mr-1" /> Done &amp; close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
