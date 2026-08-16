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
    const fail = (message: string) =>
      ({ ok: false as const, message });

    const { data: profs } = await admin
      .from("profiles")
      .select("email, status, created_at")
      .eq("sgc_id", data.sgc_id.trim())
      .order("created_at", { ascending: true });
    // Always return a generic error to avoid SGC enumeration.
    const genericMsg = "Invalid SGC ID or password.";
    const candidates = (profs ?? []).filter((p: any) => !!p?.email);
    if (candidates.length === 0) return fail(genericMsg);

    const auth = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // An SGC ID may (unexpectedly) map to more than one account: try each.
    let matched: { email: string; status: string } | null = null;
    let session: { access_token: string; refresh_token: string } | null = null;
    for (const cand of candidates) {
      const { data: signed, error } = await auth.auth.signInWithPassword({
        email: cand.email as string,
        password: data.password,
      });
      if (!error && signed.session) {
        matched = { email: cand.email as string, status: cand.status as string };
        session = signed.session;
        break;
      }
    }
    if (!matched || !session) return fail(genericMsg);

    if (matched.status === "rejected") {
      return fail("Your access request was rejected.");
    }
    if (matched.status === "pending") {
      return fail("Your account is awaiting approval.");
    }

    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });