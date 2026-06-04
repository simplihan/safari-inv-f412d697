import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/hooks/monthly-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "server_misconfigured" }, { status: 500 });
        }
        const sb = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        // Compute previous calendar month range (UTC)
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

        // Departments with email enabled
        const { data: depts, error: deptErr } = await sb
          .from("departments")
          .select("id, name, monthly_report_email")
          .eq("monthly_report_email", true);
        if (deptErr) return Response.json({ error: deptErr.message }, { status: 500 });

        // Admin recipients (and managers per dept if any)
        const { data: admins } = await sb
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "manager"]);
        const adminIds = (admins ?? []).map((r: any) => r.user_id);
        const { data: adminProfiles } = adminIds.length
          ? await sb.from("profiles").select("id, email, department").in("id", adminIds)
          : { data: [] as any[] };

        const { data: rows } = await sb
          .from("break_logs")
          .select("user_id, duration_minutes, out_time")
          .gte("out_time", start.toISOString())
          .lt("out_time", end.toISOString());

        const { data: profs } = await sb.from("profiles").select("id, full_name, department");
        const profById: Record<string, any> = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));

        const enqueued: string[] = [];
        const sendBase = new URL(request.url);
        sendBase.pathname = "/lovable/email/transactional/send";

        for (const d of depts ?? []) {
          const deptRows = (rows ?? []).filter((r: any) => profById[r.user_id]?.department === d.name);
          const totalSessions = deptRows.length;
          const totalMinutes = deptRows.reduce((s: number, r: any) => s + (r.duration_minutes ?? 0), 0);
          const byUser: Record<string, { sessions: number; minutes: number }> = {};
          deptRows.forEach((r: any) => {
            const k = r.user_id;
            byUser[k] = byUser[k] ?? { sessions: 0, minutes: 0 };
            byUser[k].sessions += 1;
            byUser[k].minutes += r.duration_minutes ?? 0;
          });
          const topStaff = Object.entries(byUser)
            .map(([id, v]) => ({ name: profById[id]?.full_name ?? "—", ...v }))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 5);

          // Recipients: admins + managers whose profile.department matches (or no dept = global admin)
          const recipients = (adminProfiles ?? []).filter((p: any) =>
            !p.department || p.department === d.name
          );
          for (const rcpt of recipients) {
            if (!rcpt.email) continue;
            const idem = `monthly-${d.id}-${start.toISOString().slice(0, 7)}-${rcpt.id}`;
            // Insert directly into pgmq via send route would require auth; use enqueue_email RPC.
            const { error: enqErr } = await sb.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                templateName: "monthly-report",
                recipientEmail: rcpt.email,
                idempotencyKey: idem,
                templateData: {
                  siteName: "Pulse Safari",
                  department: d.name,
                  monthLabel,
                  totalSessions,
                  totalMinutes,
                  topStaff,
                },
              },
            });
            if (!enqErr) enqueued.push(idem);
          }
        }

        return Response.json({ ok: true, month: monthLabel, enqueued: enqueued.length });
      },
    },
  },
});