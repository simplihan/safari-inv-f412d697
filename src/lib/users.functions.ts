import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(120),
  sgc_id: z.string().min(1).max(40),
  mobile: z.string().max(40).optional().nullable(),
  department: z.string().min(1).max(120),
  role: z.enum(["admin", "manager", "supervisor", "staff"]).default("staff"),
  status: z.enum(["pending", "approved", "rejected"]).default("approved"),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify caller is admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        sgc_id: data.sgc_id,
        mobile: data.mobile ?? null,
        department: data.department,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Failed to create user");

    const uid = created.user.id;

    // handle_new_user trigger inserts profile (pending, staff). Patch to desired values.
    await supabaseAdmin.from("profiles").update({
      full_name: data.full_name,
      sgc_id: data.sgc_id,
      mobile: data.mobile ?? null,
      department: data.department,
      status: data.status,
    }).eq("id", uid);

    if (data.role !== "staff") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    }

    return { id: uid };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(128) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin role required");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminSetRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      user_id: z.string().uuid(),
      roles: z.array(z.enum(["admin", "manager", "supervisor", "staff"])).min(1).max(4),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const unique = Array.from(new Set(data.roles));
    const rows = unique.map((role) => ({ user_id: data.user_id, role }));
    const { error } = await supabaseAdmin.from("user_roles").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      user_id: z.string().uuid(),
      active: z.boolean(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.active ? "approved" : "rejected" })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // Optional: revoke all sessions when deactivating
    if (!data.active) {
      try { await supabaseAdmin.auth.admin.signOut(data.user_id); } catch {}
    }
    return { ok: true };
  });