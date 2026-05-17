import { useEffect, useState, ReactNode } from "react";
import { Monitor } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const MIN_WIDTH = 1024;

export function DeviceGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const { canManage, loading } = useAuth();

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const ua = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|iphone|ipad|ipod|mobile|tablet|silk|kindle|playbook|bb10/i.test(ua);
      setOk(w >= MIN_WIDTH && !isMobileUA);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (ok === null || loading) return null;
  // Admins & managers bypass the desktop-only restriction
  if (ok || canManage) return <>{children}</>;

  return (
    <div className="min-h-screen grid place-items-center px-6 text-center bg-background">
      <div className="max-w-md glass-strong rounded-2xl p-8">
        <div className="h-14 w-14 rounded-2xl gradient-primary grid place-items-center mx-auto mb-4">
          <Monitor className="h-7 w-7 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Desktop only</h1>
        <p className="text-sm text-muted-foreground mt-2">
          PulseHR is available on laptops &amp; desktops only. Please open this app on a computer
          with a screen width of at least 1024px.
        </p>
      </div>
    </div>
  );
}