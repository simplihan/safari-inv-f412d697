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
    z
      .object({
        user_id: z.string().uuid(),
        reason: z.string().min(1).max(40),
        remarks: z.string().max(500).optional().nullable(),
      })
      .parse(d),
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

    const { error } = await supabaseAdmin.from("break_logs").insert({
      user_id: data.user_id,
      reason: data.reason as any,
      remarks: data.remarks ?? null,
      out_time: new Date().toISOString(),
      status: "out",
    });
    if (error) {
      if (error.message?.includes("staff members are already out")) {
        throw new Error("8 staff members are already out. Please wait for them to return before stepping out.");
      }
      throw new Error(error.message);
    }
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

    const { error } = await supabaseAdmin
      .from("break_logs")
      .update({
        in_time: inTime.toISOString(),
        duration_minutes: dur,
        status: "in",
      })
      .eq("id", data.activity_id);
    if (error) throw new Error(error.message);
    return { ok: true, duration_minutes: dur };
  });

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminUpdateActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        activity_id: z.string().uuid(),
        reason: z.enum(["Tea Break", "Lunch", "Prayer", "Shopping", "Meeting", "Other"]).optional(),
        remarks: z.string().max(500).optional().nullable(),
        out_time: z.string().datetime().optional(),
        in_time: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("break_logs")
      .select("out_time, in_time, status")
      .eq("id", data.activity_id)
      .maybeSingle();
    if (!row) throw new Error("Activity not found.");

    const patch: any = {};
    if (data.reason !== undefined) patch.reason = data.reason;
    if (data.remarks !== undefined) patch.remarks = data.remarks;
    if (data.out_time !== undefined) patch.out_time = data.out_time;
    if (data.in_time !== undefined) patch.in_time = data.in_time;

    const newOut = patch.out_time ?? row.out_time;
    const newIn = patch.in_time !== undefined ? patch.in_time : row.in_time;
    if (newIn) {
      patch.status = "in";
      patch.duration_minutes = Math.max(
        1,
        Math.round((new Date(newIn).getTime() - new Date(newOut).getTime()) / 60000),
      );
    } else {
      patch.status = "out";
      patch.duration_minutes = null;
    }

    const { error } = await supabaseAdmin.from("break_logs").update(patch).eq("id", data.activity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ activity_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("break_logs").delete().eq("id", data.activity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
