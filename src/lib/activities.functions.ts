import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdminOrManager(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"]);
  if (!data || data.length === 0) throw new Error("Forbidden: admin or manager role required");
}

export const adminStartActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      reason: z.string().min(1).max(40),
      remarks: z.string().max(500).optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdminOrManager(supabase, userId);

    const { data: open } = await supabaseAdmin
      .from("break_logs")
      .select("id")
      .eq("user_id", data.user_id)
      .eq("status", "out")
      .maybeSingle();
    if (open) throw new Error("User already has an open activity.");

    const remarks = `${data.remarks ?? ""}${data.remarks ? " | " : ""}[admin start]`.trim();
    const { error } = await supabaseAdmin.from("break_logs").insert({
      user_id: data.user_id,
      reason: data.reason as any,
      remarks,
      out_time: new Date().toISOString(),
      status: "out",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminStopActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ activity_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdminOrManager(supabase, userId);

    const { data: row } = await supabaseAdmin
      .from("break_logs")
      .select("id, out_time, remarks, status")
      .eq("id", data.activity_id)
      .maybeSingle();
    if (!row) throw new Error("Activity not found.");
    if (row.status !== "out") throw new Error("Activity is not open.");

    const inTime = new Date();
    const dur = Math.max(1, Math.round((inTime.getTime() - new Date(row.out_time).getTime()) / 60000));
    const remarks = `${row.remarks ?? ""}${row.remarks ? " | " : ""}[admin stop]`.trim();

    const { error } = await supabaseAdmin
      .from("break_logs")
      .update({
        in_time: inTime.toISOString(),
        duration_minutes: dur,
        status: "in",
        remarks,
      })
      .eq("id", data.activity_id);
    if (error) throw new Error(error.message);
    return { ok: true, duration_minutes: dur };
  });