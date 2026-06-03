import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(120),
  sgc_id: z.string().min(1).max(40),
  mobile: z.string().max(40).optional().nullable(),
  department: z.string().min(1).max(120),
  role: z.enum(["admin", "manager", "staff"]).default("staff"),
  status: z.enum(["pending", "approved", "rejected"]).default("approved"),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify caller is admin
    const { data: roleRow, error: roleLookupError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleLookupError) {
      console.error("[adminCreateUser] admin role lookup failed:", roleLookupError);
      return { ok: false as const, error: "Unable to verify admin access. Please try again." };
    }
    if (!roleRow) return { ok: false as const, error: "Only admins can create users." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    if (error || !created.user) {
      console.error("[adminCreateUser] auth.admin.createUser failed:", error);
      return { ok: false as const, error: "Failed to create user. Please verify the email is not already in use." };
    }

    const uid = created.user.id;

    // Ensure a profile row exists (in case trigger didn't run / fired with warnings)
    const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert({
      id: uid,
      email: data.email,
      full_name: data.full_name,
      sgc_id: data.sgc_id,
      mobile: data.mobile ?? null,
      department: data.department,
      status: data.status,
    });
    if (upsertErr) {
      console.error("[adminCreateUser] profile upsert failed:", upsertErr);
      // rollback auth user so admin can retry cleanly
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      return { ok: false as const, error: "Failed to save user profile. Please try again." };
    }

    // Ensure role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: data.role });
    if (roleErr) {
      console.error("[adminCreateUser] role insert failed:", roleErr);
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      return { ok: false as const, error: "Failed to assign user role. Please try again." };
    }

    return { ok: true as const, id: uid };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(128) }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow, error: roleLookupError } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (roleLookupError) {
      console.error("[adminResetPassword] admin role lookup failed:", roleLookupError);
      return { ok: false as const, error: "Unable to verify admin access. Please try again." };
    }
    if (!roleRow) return { ok: false as const, error: "Only admins can reset passwords." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) {
      console.error("[adminResetPassword] updateUserById failed:", error);
      return { ok: false as const, error: "Failed to reset password. Please try again." };
    }
    return { ok: true };
  });