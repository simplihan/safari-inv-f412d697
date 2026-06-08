import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Activity, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl gradient-primary grid place-items-center shadow-lg">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Pulse Safari</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
          <Button asChild className="gradient-primary text-primary-foreground border-0">
            <Link to="/register">Request access</Link>
          </Button>
        </nav>
      </header>

      <section className="container mx-auto px-6 pt-16 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Live realtime tracking
          </span>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight">
            Break & activity tracking, <span className="text-gradient">in real time</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Monitor every activity in real time—from breaks and meetings to field work and productivity—with an intelligent workforce platform built for modern teams.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Button asChild size="lg" className="gradient-primary text-primary-foreground border-0 shadow-lg">
              <Link to="/register">Get started <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">I have an account</Link>
            </Button>
          </div>
        </motion.div>

        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: Clock, title: "Multi-OUT tracking", desc: "Log breaks, prayer, lunch, meetings — auto-calculated durations." },
            { icon: Users, title: "Live monitoring", desc: "See exactly who is out and for how long, updated instantly." },
            { icon: ShieldCheck, title: "Approval workflow", desc: "Pending registrations, role-based access, secure by default." },
          ].map((f, i) => (

           
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.2 }}
              className="glass rounded-2xl p-6 text-left"
            >
              <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
