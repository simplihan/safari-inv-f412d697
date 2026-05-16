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
import { Send, Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const Route = createFileRoute("/app/chat")({ component: Chat });

type Person = { id: string; full_name: string; department: string | null; profile_image: string | null };
type Msg = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string; read_at: string | null };

function Chat() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [active, setActive] = useState<Person | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);

  // load contacts (everyone visible to me — RLS handles dept scoping)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, department, profile_image, status")
        .eq("status", "approved")
        .order("full_name");
      setPeople(((data ?? []) as any[]).filter((p) => p.id !== user?.id));
    })();
  }, [user?.id]);

  // load unread counts
  const loadUnread = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("recipient_id", user.id)
      .is("read_at", null);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((m: any) => { counts[m.sender_id] = (counts[m.sender_id] ?? 0) + 1; });
    setUnread(counts);
  };
  useEffect(() => { loadUnread(); }, [user?.id]);

  // load conversation
  const loadConvo = async (other: Person) => {
    if (!user) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${other.id}),and(sender_id.eq.${other.id},recipient_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
    // mark read
    await supabase.from("messages").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id).eq("sender_id", other.id).is("read_at", null);
    loadUnread();
  };

  useEffect(() => { if (active) loadConvo(active); /* eslint-disable-next-line */ }, [active?.id]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("messages-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Msg;
        if (m.recipient_id !== user.id && m.sender_id !== user.id) return;
        if (active && (m.sender_id === active.id || m.recipient_id === active.id)) {
          setMessages((prev) => [...prev, m]);
          if (m.recipient_id === user.id) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
          }
        } else if (m.recipient_id === user.id) {
          setUnread((u) => ({ ...u, [m.sender_id]: (u[m.sender_id] ?? 0) + 1 }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, active?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active || !user) return;
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      sender_id: user.id, recipient_id: active.id, content: text,
    });
    if (error) setDraft(text);
  };

  const filtered = useMemo(
    () => people.filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase())),
    [people, q]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chat</h1>
        <p className="text-muted-foreground mt-1 text-sm">Private 1-on-1 messages. Auto-deleted after 10 days.</p>
      </div>
      <Card className="glass-strong overflow-hidden grid grid-cols-[280px_1fr] h-[calc(100vh-220px)] min-h-[500px]">
        {/* Sidebar */}
        <aside className="border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-8" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <ul>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setActive(p)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors",
                      active?.id === p.id && "bg-accent/60"
                    )}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.profile_image ?? undefined} />
                      <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                        {p.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.department ?? "—"}</p>
                    </div>
                    {unread[p.id] > 0 && (
                      <Badge className="gradient-primary text-primary-foreground border-0">{unread[p.id]}</Badge>
                    )}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No people found</p>}
            </ul>
          </ScrollArea>
        </aside>

        {/* Conversation */}
        <section className="flex flex-col min-w-0">
          {!active ? (
            <div className="flex-1 grid place-items-center text-center text-muted-foreground">
              <div>
                <MessageCircle className="h-10 w-10 mx-auto opacity-50" />
                <p className="mt-3 text-sm">Pick someone to start chatting</p>
              </div>
            </div>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-border flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={active.profile_image ?? undefined} />
                  <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                    {active.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-tight">{active.full_name}</p>
                  <p className="text-xs text-muted-foreground">{active.department ?? "—"}</p>
                </div>
              </header>
              <ScrollArea className="flex-1 px-4 py-4">
                <div className="space-y-2">
                  {messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div className={cn(
                          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          mine ? "gradient-primary text-primary-foreground rounded-br-sm" : "bg-accent/60 rounded-bl-sm"
                        )}>
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={cn("text-[10px] mt-1 opacity-70", mine ? "text-right" : "")}>
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
              </ScrollArea>
              <form
                onSubmit={(e) => { e.preventDefault(); send(); }}
                className="border-t border-border p-3 flex items-center gap-2"
              >
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" />
                <Button type="submit" className="gradient-primary text-primary-foreground border-0" disabled={!draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      </Card>
    </div>
  );
}