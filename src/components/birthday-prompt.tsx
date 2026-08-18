import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Cake } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

const SKIP_KEY = "birthdayPromptSkipped";

/** Asks signed-in users once for their birthday if it's still missing. */
export function BirthdayPrompt() {
  const { user, profile, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.id || !profile) return;
    if (profile.birth_date) return;
    if (localStorage.getItem(SKIP_KEY) === user.id) return;
    setOpen(true);
  }, [user?.id, profile?.birth_date, profile]);

  if (!open) return null;

  const save = async () => {
    if (!value) return toast.error("Please pick your birthday");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ birth_date: value }).eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Birthday saved 🎂");
    await refresh();
    setOpen(false);
  };

  const later = () => {
    if (user?.id) localStorage.setItem(SKIP_KEY, user.id);
    setOpen(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) later(); }}>
      <DialogContent className="glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="h-5 w-5 text-primary" /> Add your birthday
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          We'd love to celebrate with you. Your birthday is shown to the team on your special day.
        </p>
        <div className="mt-2">
          <Label>Date of birth</Label>
          <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={later} disabled={busy}>Maybe later</Button>
          <Button onClick={save} disabled={busy} className="gradient-primary text-primary-foreground border-0">
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}