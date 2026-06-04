import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/unsubscribe")({ component: UnsubscribePage });

type State = "loading" | "ready" | "already" | "invalid" | "success" | "error";

function UnsubscribePage() {
  const [state, setState] = useState<State>("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("ready");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setState("loading");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.success) setState("success");
      else if (d.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch { setState("error"); }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-background">
      <Card className="w-full max-w-md glass-strong">
        <CardHeader><CardTitle>Email preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && <p className="text-sm text-muted-foreground">Loading…</p>}
          {state === "ready" && (
            <>
              <p className="text-sm">Confirm you want to unsubscribe from Pulse Safari emails. You'll stop receiving all transactional emails to this address.</p>
              <Button onClick={confirm} className="w-full gradient-primary text-primary-foreground border-0">Confirm unsubscribe</Button>
            </>
          )}
          {state === "already" && <p className="text-sm">This address is already unsubscribed.</p>}
          {state === "success" && <p className="text-sm">You've been unsubscribed. We won't email you again.</p>}
          {state === "invalid" && <p className="text-sm text-destructive">Invalid or expired link.</p>}
          {state === "error" && <p className="text-sm text-destructive">Something went wrong. Please try again.</p>}
        </CardContent>
      </Card>
    </div>
  );
}