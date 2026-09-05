import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  FESTIVALS,
  countryFlag,
  festivalDisplayEmoji,
  matchesToday,
  type Festival,
} from "@/lib/festivals";
import { CountryFlag, isNationalDay } from "@/components/country-flag";

const COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#38bdf8"];

function Sparkles() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2.5 + Math.random() * 2,
        color: COLORS[i % COLORS.length],
        size: 5 + Math.random() * 7,
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

/** Shows a celebratory popup for major festivals (India, Nepal, Philippines, Qatar). */
export function FestivalCelebration() {
  const [items, setItems] = useState<Festival[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Load the admin-managed list; fall back to the built-in list if unavailable.
      let list: Festival[] = FESTIVALS;
      const { data } = await (supabase as any)
        .from("festivals")
        .select("id, name, country, flag, emoji, greeting, dates, active")
        .eq("active", true);
      if (Array.isArray(data) && data.length) {
        list = data.map((f: any) => ({
          id: f.id,
          name: f.name,
          country: f.country,
          flag: f.flag || countryFlag(f.country),
          emoji: f.emoji,
          greeting: f.greeting ?? "",
          dates: f.dates ?? [],
        })) as Festival[];
      }
      if (cancelled) return;

      const params = new URLSearchParams(window.location.search);
      const demo = params.get("festivalDemo");
      if (demo) {
        const picked =
          demo === "1"
            ? list.slice(0, 1)
            : list.filter((f) => f.id === demo || f.name.toLowerCase() === demo.toLowerCase());
        if (picked.length) {
          setItems(picked);
          setOpen(true);
        }
        return;
      }

      const today = list.filter((f) => matchesToday(f, new Date()));
      if (!today.length) return;
      setItems(today);
      const key = `festivalSeen:${new Date().toDateString()}`;
      if (localStorage.getItem(key) !== "1") setOpen(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items.length) return null;

  const close = () => {
    localStorage.setItem(`festivalSeen:${new Date().toDateString()}`, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="glass-strong sm:max-w-md overflow-hidden text-center">
        <Sparkles />
        <div className="relative py-4 space-y-4">
          <motion.div
            initial={{ scale: 0.6, rotate: -10 }}
            animate={{ scale: [1, 1.12, 1], rotate: [0, 6, -6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="text-5xl"
          >
            <span className="flex flex-wrap items-center justify-center gap-3">
              {items.map((festival) => (
                <span key={festival.id} className="inline-flex items-center gap-2">
                  <CountryFlag country={festival.country} fallback={festival.flag} />
                  <span>{festivalDisplayEmoji(festival)}</span>
                </span>
              ))}
            </span>
          </motion.div>
          <div className="space-y-3">
            {items.map((f) => (
              <div key={f.id} className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">
                  <span className="inline-flex flex-wrap items-center justify-center gap-2">
                    <CountryFlag country={f.country} fallback={countryFlag(f.country, f.flag)} />
                    <span>{f.name}</span>
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">{f.greeting}</p>
              </div>
            ))}
          </div>
          <Button onClick={close} className="gradient-primary text-primary-foreground border-0">
            Celebrate 🎈
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
