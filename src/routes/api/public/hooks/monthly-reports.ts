import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { EmailAPIError } from "@lovable.dev/email-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

function isAuthorizedScheduler(request: Request, serviceKey: string) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const cronSecret = process.env.CRON_SECRET;

  if (bearer && bearer === serviceKey) return true;
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) return true;

  return false;
}

export const Route = createFileRoute("/api/public/hooks/monthly-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "server_misconfigured" }, { status: 500 });
        }
        // This endpoint performs privileged report generation, so the public
        // browser key is not accepted. Cron callers must present a server-only
        // credential in Authorization: Bearer <service-role key> or x-cron-secret.
        if (!isAuthorizedScheduler(request, serviceKey)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
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
          .select("id, name, monthly_report_email, monthly_report_subject, monthly_report_recipients")
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

        const sent: string[] = [];

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

          // Explicit per-department override list takes priority when set.
          const overrides = String(d.monthly_report_recipients ?? "")
            .split(/[,;\s]+/)
            .map((e) => e.trim())
            .filter((e) => e.includes("@"));
          const recipients = overrides.length
            ? overrides.map((email) => ({ id: email.toLowerCase(), email, department: d.name }))
            // Default: admins + managers whose profile.department matches (or no dept = global admin)
            : (adminProfiles ?? []).filter((p: any) => !p.department || p.department === d.name);

          const templateData = {
            siteName: "Pulse Safari",
            department: d.name,
            monthLabel,
            subject: d.monthly_report_subject || undefined,
            totalSessions,
            totalMinutes,
            topStaff,
          };

          for (const rcpt of recipients) {
            if (!rcpt.email) continue;
            const idem = `monthly-report-${d.id}-${start.toISOString().slice(0, 7)}-${rcpt.id}`;

            const logOutcome = async (
              status: "sent" | "suppressed" | "failed",
              errorMessage?: string
            ) => {
              const { error } = await sb.from("email_send_log").insert({
                message_id: null,
                template_name: "monthly-report",
                recipient_email: rcpt.email,
                status,
                error_message: errorMessage ?? null,
              });
              if (error) {
                console.error("Failed to write email_send_log", {
                  code: error.code,
                  message: error.message,
                });
              }
            };

            // One retry after the rate-limit cooldown Lovable reports.
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const result = await sendTemplateEmail("monthly-report", rcpt.email, {
                  templateData,
                  idempotencyKey: idem,
                });
                if (result.sent) {
                  await logOutcome("sent");
                  sent.push(idem);
                } else {
                  await logOutcome("suppressed", "Recipient is suppressed");
                }
                break;
              } catch (error) {
                if (
                  attempt === 0 &&
                  error instanceof EmailAPIError &&
                  error.status === 429
                ) {
                  const waitSeconds = error.retryAfterSeconds ?? 60;
                  await new Promise((r) => setTimeout(r, waitSeconds * 1000));
                  continue;
                }
                const msg = error instanceof Error ? error.message : String(error);
                console.error("Monthly report send failed", { message: msg });
                await logOutcome("failed", msg.slice(0, 1000));
                break;
              }
            }
          }
        }

        return Response.json({ ok: true, month: monthLabel, sent: sent.length });
      },
    },
  },
});
