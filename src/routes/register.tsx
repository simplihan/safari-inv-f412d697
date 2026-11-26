import { friendlyError } from "@/lib/friendly-error";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments } from "@/hooks/use-departments";
import { toast } from "sonner";
import { readRegistrationStatus, useRegistrationStatus } from "@/hooks/use-registration-status";

export const Route = createFileRoute("/register")({
  component: Register,
  head: () => ({ meta: [
    { title: "Request access | Pulse Safari" },
    { name: "description", content: "Request a Pulse Safari account for your department." },
    { property: "og:title", content: "Request access | Pulse Safari" },
    { property: "og:description", content: "Request a Pulse Safari account for your department." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Register() {
  const navigate = useNavigate();
  const { names: deptNames } = useDepartments();
  const { enabled, error: statusError, refresh } = useRegistrationStatus();
  const [form, setForm] = useState({
    full_name: "",
    sgc_id: "",
    email: "",
    mobile: "",
    department: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enabled !== true) return;
    if (!form.department) return toast.error("Select a department");
    setLoading(true);

    try {
      if (!(await readRegistrationStatus())) {
        await refresh();
        setLoading(false);
        return toast.error("New access requests are currently paused.");
      }
    } catch {
      setLoading(false);
      return toast.error("Could not check access requests. Please try again.");
    }

    // Block duplicate SGC ID / mobile before creating the account
    const { data: taken } = await (supabase.rpc as any)("registration_identity_taken", {
      _sgc: form.sgc_id.trim(),
      _mobile: form.mobile.trim(),
    });
    const row = Array.isArray(taken) ? taken[0] : taken;
    if (row?.sgc_taken) {
      setLoading(false);
      return toast.error("This SGC ID is already registered.");
    }
    if (row?.mobile_taken) {
      setLoading(false);
      return toast.error("This mobile number is already registered.");
    }

    const redirectUrl = `${window.location.origin}/login`;
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: form.full_name,
          sgc_id: form.sgc_id,
          mobile: form.mobile,
          department: form.department,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(friendlyError(error));
    toast.success("Request submitted. You'll be notified once approved.");
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg glass-strong rounded-2xl p-8"
      >
        <Link to="/" className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-xl gradient-primary grid place-items-center">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold">Pulse Safari</span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Request access</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">
          {enabled === true ? "An admin or manager will approve your account." : enabled === false ? "New access requests are currently paused. Please contact your administrator." : statusError ? "Could not check access requests." : "Checking access requests…"}
        </p>
        {statusError && <div className="mt-4 text-center"><Button variant="outline" onClick={() => void refresh()}>Retry</Button></div>}
        {enabled === true && <form onSubmit={onSubmit} className="mt-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Full name</Label><Input required value={form.full_name} onChange={set("full_name")} className="mt-1" /></div>
          <div><Label>SGC ID</Label><Input required value={form.sgc_id} onChange={set("sgc_id")} className="mt-1" /></div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {deptNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={set("mobile")} className="mt-1" /></div>
          <div><Label>Email</Label><Input type="email" required value={form.email} onChange={set("email")} className="mt-1" /></div>
          <div className="col-span-2"><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={set("password")} className="mt-1" /></div>
          <Button type="submit" disabled={loading} className="col-span-2 gradient-primary text-primary-foreground border-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
          </Button>
        </form>}
        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already approved? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}