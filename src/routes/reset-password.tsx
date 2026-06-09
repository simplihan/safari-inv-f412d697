import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase places a recovery session in the URL hash. The client picks it up
  // automatically; we just wait for the auth state to confirm a session exists.
  useEffect(() => {
    // Surface invalid/expired link errors that Supabase puts in the URL hash
    // instead of leaving the user stuck on "Validating…".
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const err = params.get("error_description") || params.get("error");
      if (err) {
        setLinkError(decodeURIComponent(err.replace(/\+/g, " ")));
        return;
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // Failsafe: if nothing happens within 6s, treat the link as invalid.
    const t = setTimeout(() => {
      setLinkError((prev) => prev ?? "This reset link is invalid or has expired. Please request a new one.");
    }, 6000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md glass-strong rounded-2xl p-8">
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-xl gradient-primary grid place-items-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold">Pulse Safari</span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Set a new password</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">Choose something strong — at least 8 characters.</p>

        {linkError ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-sm text-destructive">{linkError}</p>
            <Link to="/forgot-password" className="text-primary font-medium text-sm">
              Request a new reset link
            </Link>
          </div>
        ) : !ready ? (
          <div className="mt-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Validating reset link…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <Label>New password</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}