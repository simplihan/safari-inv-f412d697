import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS } from "@/lib/departments";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({ component: Register });

function Register() {
  const navigate = useNavigate();
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
    if (!form.department) return toast.error("Select a department");
    setLoading(true);
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
    if (error) return toast.error(error.message);
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
          <span className="font-semibold">PulseHR</span>
        </Link>
        <h1 className="text-2xl font-bold text-center">Request access</h1>
        <p className="text-sm text-muted-foreground text-center mt-1">An admin or manager will approve your account.</p>
        <form onSubmit={onSubmit} className="mt-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Full name</Label><Input required value={form.full_name} onChange={set("full_name")} className="mt-1" /></div>
          <div><Label>SGC ID</Label><Input required value={form.sgc_id} onChange={set("sgc_id")} className="mt-1" /></div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={set("mobile")} className="mt-1" /></div>
          <div><Label>Email</Label><Input type="email" required value={form.email} onChange={set("email")} className="mt-1" /></div>
          <div className="col-span-2"><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={set("password")} className="mt-1" /></div>
          <Button type="submit" disabled={loading} className="col-span-2 gradient-primary text-primary-foreground border-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit request"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already approved? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}