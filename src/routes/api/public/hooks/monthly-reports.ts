import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import * as React from "react";
import { render as renderAsync } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "safari-inv";
const SENDER_DOMAIN = "notify.simplihan.com";
const FROM_DOMAIN = "notify.simplihan.com";

function genToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
        const template = TEMPLATES["monthly-report"];
        if (!template) return Response.json({ error: "template_missing" }, { status: 500 });

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
            const normalized = rcpt.email.toLowerCase();

            // Suppression check
            const { data: sup } = await sb.from("suppressed_emails").select("email").eq("email", normalized).maybeSingle();
            if (sup) continue;

            // Unsubscribe token (reuse if exists)
            const { data: existing } = await sb
              .from("email_unsubscribe_tokens").select("token, used_at").eq("email", normalized).maybeSingle();
            let unsubscribeToken: string;
            if (existing && !existing.used_at) {
              unsubscribeToken = existing.token;
            } else if (!existing) {
              const token = genToken();
              const { error: tokErr } = await sb
                .from("email_unsubscribe_tokens").insert({ email: normalized, token });
              if (tokErr) continue;
              unsubscribeToken = token;
            } else { continue; }

            const templateData = {
              siteName: "Pulse Safari",
              department: d.name,
              monthLabel,
              totalSessions,
              totalMinutes,
              topStaff,
            };
            const element = React.createElement(template.component, templateData);
            const html = await renderAsync(element);
            const text = await renderAsync(element, { plainText: true });
            const subject = typeof template.subject === "function"
              ? template.subject(templateData) : template.subject;
            const messageId = crypto.randomUUID();

            await sb.from("email_send_log").insert({
              message_id: messageId,
              template_name: "monthly-report",
              recipient_email: rcpt.email,
              status: "pending",
            });

            const { error: enqErr } = await sb.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: messageId,
                to: rcpt.email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: "transactional",
                label: "monthly-report",
                idempotency_key: idem,
                unsubscribe_token: unsubscribeToken,
                queued_at: new Date().toISOString(),
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