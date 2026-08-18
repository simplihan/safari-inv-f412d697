import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

type Person = { id: string; full_name: string; department: string | null; profile_image: string | null; birth_date: string | null };

const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#38bdf8"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: 420, opacity: [0, 1, 1, 0], rotate: 360 }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "linear" }}
          style={{ left: `${p.left}%`, width: p.size, height: p.size, backgroundColor: p.color }}
          className="absolute top-0 rounded-sm"
        />
      ))}
    </div>
  );
}

/** Shows a celebratory popup on the common dashboard for today's birthdays (once per day). */
export function BirthdayCelebration() {
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const demo = new URLSearchParams(window.location.search).get("birthdayDemo") === "1";
      const { data } = await supabase.rpc("list_directory");
      const now = new Date();
      const today = ((data ?? []) as any[]).filter((p) => {
        if (!p.birth_date) return false;
        const d = new Date(p.birth_date + "T00:00:00");
        return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      }) as Person[];
      if (demo) {
        const sample = (today.length ? today : ((data ?? []) as Person[]).slice(0, 2));
        if (sample.length) {
          setPeople(sample);
          setOpen(true);
        }
        return;
      }
      if (!today.length) return;
      const key = `birthdaySeen:${now.toDateString()}`;
      setPeople(today);
      if (localStorage.getItem(key) !== "1") setOpen(true);
    })();
  }, []);

  if (!people.length) return null;

  const close = () => {
    localStorage.setItem(`birthdaySeen:${new Date().toDateString()}`, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="glass-strong sm:max-w-md overflow-hidden text-center">
        <Confetti />
        <div className="relative py-4 space-y-4">
          <motion.div
            initial={{ scale: 0.6, rotate: -10 }}
            animate={{ scale: [1, 1.12, 1], rotate: [0, 6, -6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-5xl"
          >
            🎉🎂
          </motion.div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary" /> Happy Birthday!
          </h2>
          <div className="space-y-3">
            {people.map((p) => (
              <div key={p.id} className="flex items-center justify-center gap-3">
                <Avatar className="h-12 w-12 ring-2 ring-primary/40">
                  <AvatarImage src={p.profile_image ?? undefined} />
                  <AvatarFallback className="gradient-primary text-primary-foreground">
                    {p.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="font-semibold">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground">{p.department ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Wishing {people.length > 1 ? "them" : "them"} a wonderful year ahead from the whole team!
          </p>
          <Button onClick={close} className="gradient-primary text-primary-foreground border-0">
            Send wishes 🎈
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}