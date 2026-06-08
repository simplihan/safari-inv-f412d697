import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { recordLoginEvent } from "@/lib/login-events.functions";
import { signInWithSgcId } from "@/lib/auth.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const signIn = useServerFn(signInWithSgcId);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let tokens: { access_token: string; refresh_token: string };
    try {
      tokens = await signIn({ data: { sgc_id: identifier.trim(), password } });
    } catch (err: any) {
      toast.error(friendlyError({ message: err?.message ?? "Sign-in failed" }));
      setLoading(false);
      return;
    }
    const { error: setErr } = await supabase.auth.setSession(tokens);
    if (setErr) {
      toast.error(friendlyError(setErr));
      setLoading(false);
      return;
    }
    localStorage.setItem("loginAt", String(Date.now()));
    // Log device/IP (fire-and-forget)
    recordLoginEvent({ data: { user_agent: navigator.userAgent } }).catch(() => {});
    toast.success("Welcome back");
    navigate({ to: "/app/dashboard" });
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-strong rounded-2xl p-8"
      >
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-xl gradient-primary grid place-items-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold">Pulse Safari</span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Welcome back</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">Sign in to continue</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>SGC ID</Label>
            <Input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="SGC2931"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          </div>
          <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center">
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">Forgot password?</Link>
        </p>
        <p className="mt-6 text-sm text-center text-muted-foreground">
          No account? <Link to="/register" className="text-primary font-medium">Request access</Link>
        </p>
      </motion.div>
    </div>
  );
}