import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Search,
  MessageCircle,
  Check,
  CheckCheck,
  BellOff,
  Bell,
  Smile,
  MoreVertical,
  Forward,
  Trash2,
  Reply,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/chat")({ component: Chat });

type Person = {
  id: string;
  full_name: string;
  department: string | null;
  profile_image: string | null;
  last_seen_at: string | null;
};
type Msg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  delivered_at?: string | null;
  reply_to_id?: string | null;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

function presenceLabel(iso: string | null, onlineIds: Set<string>, id: string): { online: boolean; text: string } {
  if (onlineIds.has(id)) return { online: true, text: "Online" };
  if (!iso) return { online: false, text: "Offline" };
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay)
    return {
      online: false,
      text: `Last seen today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    };
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString())
    return {
      online: false,
      text: `Last seen yesterday at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    };
  return {
    online: false,
    text: `Last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  };
}

function Chat() {
  const { user, profile, canManage } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState<Person | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lastMsg, setLastMsg] = useState<Record<string, Msg>>({});
  const [myDeptChatOn, setMyDeptChatOn] = useState(true);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null);
  const [forwardPicks, setForwardPicks] = useState<Set<string>>(new Set());
  const [forwardQ, setForwardQ] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

  // dept chat on/off
  useEffect(() => {
    if (!profile?.department) return;
    const load = async () => {
      const { data } = await supabase
        .from("dept_chat_settings")
        .select("enabled")
        .eq("department", profile.department!)
        .maybeSingle();
      setMyDeptChatOn(data?.enabled ?? true);
    };
    load();
    const ch = supabase
      .channel("chat-page-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "dept_chat_settings" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.department]);

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  };

  // Default-on: auto-prompt once per user, only if they haven't disabled in profile
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    if (((profile as any)?.notif_enabled ?? true) === false) return;
    const k = `notif-asked-${user?.id ?? ""}`;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
    Notification.requestPermission()
      .then(setNotifPerm)
      .catch(() => {});
  }, [user?.id, profile]);
  const fireDesktopNotif = (m: Msg, from: Person | undefined) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (((profile as any)?.notif_enabled ?? true) === false) return;
    if (document.visibilityState === "visible" && activeIdRef.current === m.sender_id) return;
    try {
      const n = new Notification(from?.full_name ?? "New message", {
        body: m.content.slice(0, 140),
        tag: `msg-${m.sender_id}`,
        icon: from?.profile_image ?? undefined,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* ignore */
    }
  };

  // load contacts (everyone visible to me — RLS handles dept scoping)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("list_directory");
      setPeople(
        ((data ?? []) as any[])
          .filter((p) => p.id !== user?.id)
          .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
      );
    })();
  }, [user?.id]);

  // Heartbeat: update my last_seen_at every 30s + on focus
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      supabase.rpc("touch_last_seen");
    };
    ping();
    const iv = setInterval(ping, 30_000);
    const onFocus = () => ping();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user?.id]);

  // Presence channel
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("chat-presence", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, unknown[]>;
      setOnlineIds(new Set(Object.keys(state)));
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track({ at: new Date().toISOString() });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  // Refresh peers' last_seen periodically
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data } = await supabase.rpc("list_directory");
      const map = new Map<string, string | null>(((data ?? []) as any[]).map((p) => [p.id, p.last_seen_at]));
      setPeople((prev) => prev.map((p) => ({ ...p, last_seen_at: map.get(p.id) ?? p.last_seen_at })));
    };
    const iv = setInterval(refresh, 45_000);
    return () => clearInterval(iv);
  }, [user?.id]);

  // Load my hidden messages
  useEffect(() => {
    if (!user) return;
    supabase
      .from("message_hidden")
      .select("message_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setHiddenIds(new Set((data ?? []).map((r: any) => r.message_id)));
      });
  }, [user?.id]);

  // load unread counts + last message per peer
  const loadOverview = async () => {
    if (!user) return;
    const [{ data: unreadRows }, { data: recent }] = await Promise.all([
      supabase.from("messages").select("sender_id").eq("recipient_id", user.id).is("read_at", null),
      supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    const counts: Record<string, number> = {};
    (unreadRows ?? []).forEach((m: any) => {
      counts[m.sender_id] = (counts[m.sender_id] ?? 0) + 1;
    });
    setUnread(counts);
    const last: Record<string, Msg> = {};
    (recent ?? []).forEach((m: any) => {
      const peer = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (!last[peer]) last[peer] = m as Msg;
    });
    setLastMsg(last);
  };
  useEffect(() => {
    loadOverview();
  }, [user?.id]);

  // load conversation
  const loadConvo = async (other: Person) => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
    // mark delivered + read for messages I received
    const now = new Date().toISOString();
    await supabase
      .from("messages")
      .update({ delivered_at: now, read_at: now })
      .eq("recipient_id", user.id)
      .eq("sender_id", other.id)
      .is("read_at", null);
    loadOverview();
  };

  useEffect(() => {
    if (active) loadConvo(active); /* eslint-disable-next-line */
  }, [active?.id]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("messages-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Msg;
        if (m.recipient_id !== user.id && m.sender_id !== user.id) return;
        const peer = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        setLastMsg((prev) => ({ ...prev, [peer]: m }));
        // Mark delivered immediately when *I* am the recipient
        if (m.recipient_id === user.id && !m.delivered_at) {
          supabase.from("messages").update({ delivered_at: new Date().toISOString() }).eq("id", m.id);
        }
        if (active && (m.sender_id === active.id || m.recipient_id === active.id)) {
          setMessages((prev) => [...prev, m]);
          if (m.recipient_id === user.id) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        } else if (m.recipient_id === user.id) {
          setUnread((u) => ({ ...u, [m.sender_id]: (u[m.sender_id] ?? 0) + 1 }));
          const from = people.find((p) => p.id === m.sender_id);
          fireDesktopNotif(m, from);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Msg;
        if (m.sender_id !== user.id && m.recipient_id !== user.id) return;
        const peer = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        setLastMsg((prev) => (prev[peer]?.id === m.id ? { ...prev, [peer]: m } : prev));
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const old = payload.old as { id: string };
        setMessages((prev) => prev.filter((x) => x.id !== old.id));
        setLastMsg((prev) => {
          const next: Record<string, Msg> = {};
          for (const k of Object.keys(prev)) if (prev[k].id !== old.id) next[k] = prev[k];
          return next;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, active?.id, people]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active || !user) return;
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      recipient_id: active.id,
      content: text,
      reply_to_id: replyingTo?.id ?? null,
    });
    if (error) setDraft(text);
    setReplyingTo(null);
    inputRef.current?.focus();
  };

  const deleteForMe = async (m: Msg) => {
    if (!user) return;
    setHiddenIds((s) => new Set(s).add(m.id));
    const { error } = await supabase.from("message_hidden").insert({ message_id: m.id, user_id: user.id });
    if (error) toast.error("Couldn't delete message");
  };

  const deleteForEveryone = async (m: Msg) => {
    if (!user || m.sender_id !== user.id) return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) toast.error("Couldn't delete for everyone");
    else setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  const submitForward = async () => {
    if (!forwardMsg || !user || forwardPicks.size === 0) return;
    const rows = Array.from(forwardPicks).map((rid) => ({
      sender_id: user.id,
      recipient_id: rid,
      content: forwardMsg.content,
    }));
    const { error } = await supabase.from("messages").insert(rows);
    if (error) toast.error("Couldn't forward message");
    else toast.success(`Forwarded to ${rows.length} ${rows.length === 1 ? "person" : "people"}`);
    setForwardMsg(null);
    setForwardPicks(new Set());
    setForwardQ("");
  };

  // Sort: people with conversations first (by last msg time), then the rest alphabetically.
  const sorted = useMemo(() => {
    const withMsg = people.filter((p) => lastMsg[p.id]);
    const without = people.filter((p) => !lastMsg[p.id]);
    withMsg.sort((a, b) => (lastMsg[b.id]?.created_at ?? "").localeCompare(lastMsg[a.id]?.created_at ?? ""));
    return [...withMsg, ...without];
  }, [people, lastMsg]);
  const filtered = useMemo(
    () => sorted.filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase())),
    [sorted, q],
  );

  const sameDept = (p: Person) => !!profile?.department && p.department === profile.department;
  const canMessage = active ? sameDept(active) && (canManage || myDeptChatOn) : false;

  const visibleMessages = useMemo(() => messages.filter((m) => !hiddenIds.has(m.id)), [messages, hiddenIds]);

  const forwardCandidates = useMemo(
    () =>
      people.filter((p) => (canManage || sameDept(p)) && p.full_name.toLowerCase().includes(forwardQ.toLowerCase())),
    [people, forwardQ, canManage, profile?.department],
  );

  if (!canManage && !myDeptChatOn) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center glass-strong rounded-2xl p-8">
        <BellOff className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-3">Chat is turned off</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your department's chat has been disabled by a manager. Please check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Private end-to-end encrypted messages within your department · Auto-deleted after 10 days
          </p>
        </div>
        {notifPerm !== "granted" && (
          <Button onClick={requestNotif} variant="outline" size="sm">
            <Bell className="h-4 w-4 mr-2" />
            {notifPerm === "denied" ? "Notifications blocked" : "Enable desktop notifications"}
          </Button>
        )}
      </div>
      <Card className="glass-strong overflow-hidden grid grid-cols-[320px_1fr] h-[calc(100vh-220px)] min-h-[520px]">
        {/* Sidebar */}
        <aside className="border-r border-border flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-border space-y-2 shrink-0">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chats</p>
              {profile?.department && (
                <Badge variant="secondary" className="text-[10px]">
                  {profile.department}
                </Badge>
              )}
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-8" />
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <ul className="py-1">
              {filtered.map((p) => {
                const last = lastMsg[p.id];
                const mineLast = last && last.sender_id === user?.id;
                const preview = last?.content ?? (sameDept(p) ? "Say hi 👋" : "Different department");
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setActive(p)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors",
                        active?.id === p.id && "bg-accent/60",
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={p.profile_image ?? undefined} />
                          <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                            {p.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        {presenceLabel(p.last_seen_at, onlineIds, p.id).online && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium truncate">{p.full_name}</p>
                          {last && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatWhen(last.created_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">
                          {(() => {
                            const pl = presenceLabel(p.last_seen_at, onlineIds, p.id);
                            return pl.online ? (
                              <span className="text-emerald-600 font-medium">Online</span>
                            ) : (
                              <span>{pl.text}</span>
                            );
                          })()}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p
                            className={cn(
                              "text-xs truncate flex items-center gap-1",
                              unread[p.id] > 0 ? "text-foreground font-medium" : "text-muted-foreground",
                            )}
                          >
                            {mineLast &&
                              (last?.read_at ? (
                                <CheckCheck className="h-3 w-3 text-primary shrink-0" />
                              ) : last?.delivered_at ? (
                                <CheckCheck className="h-3 w-3 shrink-0 opacity-60" />
                              ) : (
                                <Check className="h-3 w-3 shrink-0 opacity-60" />
                              ))}
                            <span className="truncate">{preview}</span>
                          </p>
                          {unread[p.id] > 0 && (
                            <Badge className="gradient-primary text-primary-foreground border-0 h-5 min-w-5 px-1.5 text-[10px]">
                              {unread[p.id]}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">No people found</p>
              )}
            </ul>
          </ScrollArea>
        </aside>

        {/* Conversation */}
        <section className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          {!active ? (
            <div className="flex-1 grid place-items-center text-center text-muted-foreground">
              <div>
                <MessageCircle className="h-10 w-10 mx-auto opacity-50" />
                <p className="mt-3 text-sm">Pick someone to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-border flex items-center gap-3 sticky top-0 z-10 bg-card/95 backdrop-blur">
                <div className="relative">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={active.profile_image ?? undefined} />
                    <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                      {active.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  {presenceLabel(active.last_seen_at, onlineIds, active.id).online && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium leading-tight">{active.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const pl = presenceLabel(active.last_seen_at, onlineIds, active.id);
                      return pl.online ? (
                        <span className="text-emerald-600 font-medium">Online</span>
                      ) : (
                        <span>{pl.text}</span>
                      );
                    })()}
                  </p>
                </div>
              </header>
              <ScrollArea className="flex-1 px-4 py-4 bg-gradient-to-b from-transparent to-accent/10">
                <div className="space-y-2">
                  {visibleMessages.map((m, i) => {
                    const mine = m.sender_id === user?.id;
                    const prev = visibleMessages[i - 1];
                    const showDate =
                      !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                    const replyTo = m.reply_to_id ? visibleMessages.find((x) => x.id === m.reply_to_id) : undefined;
                    return (
                      <div
                        key={m.id}
                        ref={(el) => {
                          msgRefs.current[m.id] = el;
                        }}
                      >
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 rounded-full px-3 py-1">
                              {dayLabel(m.created_at)}
                            </span>
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("group flex items-center gap-1", mine ? "justify-end" : "justify-start")}
                        >
                          {mine && (
                            <MessageMenu
                              mine={mine}
                              onForward={() => setForwardMsg(m)}
                              onDeleteForMe={() => deleteForMe(m)}
                              onDeleteForEveryone={() => deleteForEveryone(m)}
                              onReply={() => setReplyingTo(m)}
                            />
                          )}
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                              mine
                                ? "gradient-primary text-primary-foreground rounded-br-sm"
                                : "bg-accent/60 rounded-bl-sm",
                            )}
                          >
                            {replyTo && (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = msgRefs.current[replyTo.id];
                                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                                className={cn(
                                  "w-full text-left mb-1.5 rounded-lg px-2.5 py-1.5 text-xs border-l-2",
                                  mine
                                    ? "bg-white/10 border-white/40 text-white/90"
                                    : "bg-primary/5 border-primary/30 text-muted-foreground",
                                )}
                              >
                                <p className="font-medium truncate">
                                  {replyTo.sender_id === user?.id ? "You" : active?.full_name}
                                </p>
                                <p className="truncate opacity-80">{replyTo.content}</p>
                              </button>
                            )}
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            <p
                              className={cn(
                                "text-[10px] mt-1 opacity-70 flex items-center gap-1",
                                mine ? "justify-end" : "",
                              )}
                            >
                              <span>
                                {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {mine &&
                                (m.read_at ? (
                                  <CheckCheck className="h-3 w-3" />
                                ) : m.delivered_at ? (
                                  <CheckCheck className="h-3 w-3 opacity-60" />
                                ) : (
                                  <Check className="h-3 w-3 opacity-60" />
                                ))}
                            </p>
                          </div>
                          {!mine && (
                            <MessageMenu
                              mine={mine}
                              onForward={() => setForwardMsg(m)}
                              onDeleteForMe={() => deleteForMe(m)}
                              onDeleteForEveryone={() => deleteForEveryone(m)}
                              onReply={() => setReplyingTo(m)}
                            />
                          )}
                        </motion.div>
                      </div>
                    );
                  })}
                  {visibleMessages.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-8">
                      No messages yet. Start the conversation.
                    </p>
                  )}
                  <div ref={endRef} />
                </div>
              </ScrollArea>
              {canMessage ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                  className="border-t border-border"
                >
                  {replyingTo && (
                    <div className="px-3 pt-2 flex items-start gap-2 bg-muted/30">
                      <div className="flex-1 min-w-0 border-l-2 border-primary/40 pl-2 py-1">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Replying to {replyingTo.sender_id === user?.id ? "yourself" : active?.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{replyingTo.content}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setReplyingTo(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="p-3 flex items-center gap-2">
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="shrink-0">
                          <Smile className="h-5 w-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        className="p-0 w-auto border-0 bg-transparent shadow-none"
                      >
                        <EmojiPicker
                          onEmojiClick={(e) => {
                            setDraft((d) => d + e.emoji);
                            inputRef.current?.focus();
                          }}
                          emojiStyle={EmojiStyle.NATIVE}
                          theme={Theme.AUTO}
                          width={320}
                          height={380}
                          searchDisabled={false}
                          skinTonesDisabled
                          previewConfig={{ showPreview: false }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={replyingTo ? "Reply…" : "Type a message…"}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      className="gradient-primary text-primary-foreground border-0"
                      disabled={!draft.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
                  You can only message people in your own department.
                </div>
              )}
            </>
          )}
        </section>
      </Card>

      {/* Forward dialog */}
      <Dialog
        open={!!forwardMsg}
        onOpenChange={(o) => {
          if (!o) {
            setForwardMsg(null);
            setForwardPicks(new Set());
            setForwardQ("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
            <DialogDescription className="line-clamp-2">"{forwardMsg?.content}"</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search people"
              className="pl-8"
              value={forwardQ}
              onChange={(e) => setForwardQ(e.target.value)}
            />
          </div>
          <ScrollArea className="h-64 -mx-2">
            <ul className="px-2 space-y-1">
              {forwardCandidates.map((p) => {
                const checked = forwardPicks.has(p.id);
                return (
                  <li key={p.id}>
                    <label className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/40 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForwardPicks((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p.profile_image ?? undefined} />
                        <AvatarFallback className="gradient-primary text-primary-foreground text-[10px]">
                          {p.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.department ?? "—"}</p>
                      </div>
                    </label>
                  </li>
                );
              })}
              {forwardCandidates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No people found</p>
              )}
            </ul>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForwardMsg(null)}>
              Cancel
            </Button>
            <Button
              className="gradient-primary text-primary-foreground border-0"
              disabled={forwardPicks.size === 0}
              onClick={submitForward}
            >
              <Forward className="h-4 w-4 mr-2" />
              Forward ({forwardPicks.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageMenu({
  mine,
  onForward,
  onDeleteForMe,
  onDeleteForEveryone,
  onReply,
}: {
  mine: boolean;
  onForward: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onReply: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mine ? "end" : "start"}>
        <DropdownMenuItem onClick={onReply}>
          <Reply className="h-4 w-4 mr-2" /> Reply
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onForward}>
          <Forward className="h-4 w-4 mr-2" /> Forward
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDeleteForMe}>
          <Trash2 className="h-4 w-4 mr-2" /> Delete for me
        </DropdownMenuItem>
        {mine && (
          <DropdownMenuItem onClick={onDeleteForEveryone} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Delete for everyone
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
