import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdminOrManager(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"]);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (roles.includes("admin")) return true;
  const { data: prof } = await supabaseAdmin.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (prof?.status !== "approved") throw new Error("Forbidden: account not approved");
  if (roles.length > 0) return false;
  // Individual edit-level grant on live monitoring confers the same ability.
  const { data: canEdit } = await supabase.rpc("has_edit_permission", {
    _user_id: userId,
    _perm: "view_monitoring",
  });
  if (canEdit === true) return false;
  throw new Error("Forbidden: admin or manager role required");
}

/** Non-admins may only act on non-admin users they are allowed to see (same department or global grant). */
async function requireCanManageUser(supabase: any, actorId: string, targetId: string) {
  const isAdmin = await requireAdminOrManager(supabase, actorId);
  if (isAdmin) return;
  const { data: targetAdmin } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", targetId).eq("role", "admin").maybeSingle();
  if (targetAdmin) throw new Error("Forbidden: cannot modify an admin's activity");
  const { data: visible } = await supabase.rpc("list_visible_user_ids");
  const ok = ((visible ?? []) as { user_id: string }[]).some((v) => v.user_id === targetId);
  if (!ok) throw new Error("Forbidden: user is outside your department");
}

async function requireCanManageActivity(supabase: any, actorId: string, activityId: string) {
  const { data: row } = await supabaseAdmin.from("break_logs").select("user_id").eq("id", activityId).maybeSingle();
  if (!row) throw new Error("Activity not found.");
  await requireCanManageUser(supabase, actorId, row.user_id);
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
    await requireCanManageUser(supabase, userId, data.user_id);

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
        throw new Error("8 staff members from your department are already out. Please wait for them to return before stepping out.");
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
    await requireCanManageActivity(supabase, userId, data.activity_id);

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
    await requireCanManageActivity(context.supabase, context.userId, data.activity_id);
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
    await requireCanManageActivity(context.supabase, context.userId, data.activity_id);
    const { error } = await supabaseAdmin.from("break_logs").delete().eq("id", data.activity_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
