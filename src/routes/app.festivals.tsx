import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Pencil, Trash2, Check, X, PartyPopper, Eye } from "lucide-react";
import { toast } from "sonner";
import { countryFlag, festivalDisplayEmoji } from "@/lib/festivals";

export const Route = createFileRoute("/app/festivals")({
  component: FestivalsPage,
  head: () => ({
    meta: [
      { title: "Festivals — Safari Staff Portal" },
      {
        name: "description",
        content: "Manage the festival and holiday celebrations that greet your team on the dashboard.",
      },
      { property: "og:title", content: "Festivals — Safari Staff Portal" },
      {
        property: "og:description",
        content: "Add, edit, or remove festival celebrations shown to staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  id: string;
  name: string;
  country: string;
  flag: string;
  emoji: string;
  greeting: string;
  dates: string[];
  active: boolean;
};

const EMPTY = {
  name: "",
  country: "India",
  flag: "🎉",
  emoji: "🎉",
  greeting: "",
  dates: "",
};

const COUNTRIES = ["India", "Nepal", "Philippines", "Qatar", "Other"];

function FestivalsPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("festivals")
      .select("id, name, country, flag, emoji, greeting, dates, active")
      .order("country")
      .order("name");
    if (error) return toast.error(friendlyError(error));
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/app/dashboard" />;

  const parseDates = (raw: string) =>
    raw
      .split(/[,\n]/)
      .map((d) => d.trim())
      .filter(Boolean);

  const validDates = (list: string[]) =>
    list.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) || /^\d{2}-\d{2}$/.test(d));

  const save = async () => {
    const name = form.name.trim();
    const dates = parseDates(form.dates);
    if (!name) return toast.error("Festival name is required");
    if (!dates.length) return toast.error("Add at least one date");
    if (!validDates(dates)) return toast.error("Dates must be MM-DD (yearly) or YYYY-MM-DD");

    const payload = {
      name,
      country: form.country,
      flag: countryFlag(form.country, form.flag.trim() || "🎉"),
      emoji: /independence day|national day/i.test(name)
        ? countryFlag(form.country, form.emoji.trim() || "🎉")
        : form.emoji.trim() || "🎉",
      greeting: form.greeting.trim(),
      dates,
    };
    setBusy(true);
    const { error } = editingId
      ? await (supabase as any).from("festivals").update(payload).eq("id", editingId)
      : await (supabase as any).from("festivals").insert(payload);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(editingId ? "Festival updated" : `Added "${name}"`);
    setForm({ ...EMPTY });
    setEditingId(null);
    setAdding(false);
    load();
  };

  const startEdit = (r: Row) => {
    setEditingId(r.id);
    setAdding(true);
    setForm({
      name: r.name,
      country: r.country,
      flag: r.flag,
      emoji: r.emoji,
      greeting: r.greeting,
      dates: (r.dates ?? []).join(", "),
    });
  };

  const toggleActive = async (r: Row, next: boolean) => {
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, active: next } : x)));
    const { error } = await (supabase as any)
      .from("festivals")
      .update({ active: next })
      .eq("id", r.id);
    if (error) {
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, active: !next } : x)));
      toast.error(friendlyError(error));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const { error } = await (supabase as any).from("festivals").delete().eq("id", confirmDelete.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(`Deleted "${confirmDelete.name}"`);
    setConfirmDelete(null);
    load();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Festivals</h1>
        <p className="text-muted-foreground mt-1">
          These celebrations pop up on the Common dashboard on their date. Use MM-DD for the same date
          every year, or YYYY-MM-DD for festivals that move (Diwali, Eid, Dashain…).
        </p>
      </div>

      <Card className="glass">
        <CardContent className="p-4 space-y-3">
          {!adding ? (
            <Button
              onClick={() => {
                setForm({ ...EMPTY });
                setEditingId(null);
                setAdding(true);
              }}
              className="gradient-primary text-primary-foreground border-0"
            >
              <Plus className="h-4 w-4 mr-1" /> Add festival
            </Button>
          ) : (
            <div className="grid gap-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Diwali"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <select
                    value={form.country}
                    onChange={(e) => {
                      const country = e.target.value;
                      setForm({ ...form, country, flag: countryFlag(country, form.flag) });
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Flag / badge</Label>
                  <Input
                    value={form.flag}
                    onChange={(e) => setForm({ ...form, flag: e.target.value })}
                    placeholder="🇮🇳"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Emoji</Label>
                  <Input
                    value={form.emoji}
                    onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                    placeholder="🪔"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Greeting message</Label>
                <Textarea
                  value={form.greeting}
                  onChange={(e) => setForm({ ...form, greeting: e.target.value })}
                  placeholder="Happy Diwali! May the festival of lights bring joy and prosperity."
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Dates</Label>
                <Input
                  value={form.dates}
                  onChange={(e) => setForm({ ...form, dates: e.target.value })}
                  placeholder="11-08  or  2026-11-08, 2027-10-29"
                />
                <p className="text-xs text-muted-foreground">
                  Comma separated. MM-DD repeats every year; YYYY-MM-DD applies to that year only.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={save}
                  disabled={busy}
                  className="gradient-primary text-primary-foreground border-0"
                >
                  <Check className="h-4 w-4 mr-1" /> {editingId ? "Save changes" : "Add festival"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(null);
                    setForm({ ...EMPTY });
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={r.id} className="glass">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg gradient-primary grid place-items-center text-lg">
                <span>{festivalDisplayEmoji(r)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {countryFlag(r.country, r.flag)} {r.name}{" "}
                  <span className="text-xs text-muted-foreground">· {r.country}</span>
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {(r.dates ?? []).join(", ") || "No dates"}
                </p>
              </div>
              <div className="flex items-center gap-2 mr-1">
                <Label htmlFor={`fa-${r.id}`} className="text-xs text-muted-foreground hidden sm:inline">
                  Active
                </Label>
                <Switch
                  id={`fa-${r.id}`}
                  checked={r.active}
                  onCheckedChange={(v) => toggleActive(r, v)}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                title="Preview popup"
                onClick={() => {
                  window.location.href = `/app/common?festivalDemo=${r.id}`;
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setConfirmDelete(r)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
            <PartyPopper className="h-4 w-4" /> No festivals yet — add one above.
          </p>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This festival will no longer show a celebration popup. You can also just switch it off
              instead of deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={busy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
