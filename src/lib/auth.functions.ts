import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const signInWithSgcId = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      sgc_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
      password: z.string().min(1).max(200),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    if (!url || !serviceKey || !anonKey) {
      throw new Error("server_misconfigured");
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: prof } = await admin
      .from("profiles")
      .select("email, status")
      .eq("sgc_id", data.sgc_id.trim())
      .maybeSingle();
    // Always return a generic error to avoid SGC enumeration.
    const genericMsg = "Invalid SGC ID or password.";
    if (!prof?.email) throw new Error(genericMsg);

    const auth = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signed, error } = await auth.auth.signInWithPassword({
      email: prof.email,
      password: data.password,
    });
    if (error || !signed.session) throw new Error(genericMsg);

    if (prof.status === "rejected") {
      throw new Error("Your access request was rejected.");
    }
    if (prof.status === "pending") {
      throw new Error("Your account is awaiting approval.");
    }

    return {
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });