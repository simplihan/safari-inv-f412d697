import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@/integrations/supabase/client";

export async function attachSupabaseAuth(ctx: any) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  ctx.supabaseSession = session ?? null;
  return ctx;
}
