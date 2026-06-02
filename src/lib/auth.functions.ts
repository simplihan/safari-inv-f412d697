import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

export const signInWithSgcId = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      sgc_id: z.string().min(1).max(40),
      password: z.string().min(1).max(128),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: profile, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("email, status")
      .ilike("sgc_id", data.sgc_id.trim())
      .maybeSingle();

    if (lookupError) throw new Error("Unable to check that SGC ID right now.");
    if (!profile?.email) throw new Error("Invalid SGC ID or password.");

    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) throw new Error("Login is not configured.");

    const authClient = createClient<Database>(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: profile.email,
      password: data.password,
    });

    if (authError || !authData.session) throw new Error("Invalid SGC ID or password.");

    if (profile.status !== "approved") {
      return { status: profile.status, session: null };
    }

    return {
      status: "approved" as const,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
    };
  });