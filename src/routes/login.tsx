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

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"email" | "sgc">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    let email = identifier.trim();
    if (mode === "sgc") {
      const { data: resolved, error: rpcErr } = await supabase.rpc("get_email_by_sgc", { _sgc: identifier.trim() });
      if (rpcErr || !resolved) {
        toast.error("No account found for that SGC ID.");
        setLoading(false);
        return;
      }
      email = resolved as string;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(friendlyError(error));
      setLoading(false);
      return;
    }
    // Check status
    const { data: prof } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", data.user!.id)
      .maybeSingle();
    if (prof?.status === "rejected") {
      await supabase.auth.signOut();
      toast.error("Your access request was rejected.");
      setLoading(false);
      return;
    }
    if (prof?.status === "pending") {
      await supabase.auth.signOut();
      toast.error("Your account is awaiting approval.");
      setLoading(false);
      return;
    }
    localStorage.setItem("loginAt", String(Date.now()));
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
          <span className="font-semibold">PulseHR</span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Welcome back</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">Sign in to continue</p>
        <div className="mt-5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/40">
          <button type="button" onClick={() => setMode("email")}
            className={`text-sm py-2 rounded-lg font-medium transition ${mode === "email" ? "gradient-primary text-primary-foreground shadow" : "text-muted-foreground"}`}>
            Email
          </button>
          <button type="button" onClick={() => setMode("sgc")}
            className={`text-sm py-2 rounded-lg font-medium transition ${mode === "sgc" ? "gradient-primary text-primary-foreground shadow" : "text-muted-foreground"}`}>
            SGC ID
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>{mode === "email" ? "Email" : "SGC ID"}</Label>
            <Input
              type={mode === "email" ? "email" : "text"}
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={mode === "email" ? "you@company.com" : "SGC2931"}
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