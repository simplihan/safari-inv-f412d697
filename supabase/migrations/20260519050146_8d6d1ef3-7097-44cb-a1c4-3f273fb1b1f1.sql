
-- 1) Helper: is the user approved?
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND status = 'approved'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- 2) Tighten RLS to require approved status

-- profiles: SELECT
DROP POLICY IF EXISTS "view profile (self / dept / mgr)" ON public.profiles;
CREATE POLICY "view profile (self / dept / mgr)"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (
    public.is_approved(auth.uid())
    AND (id = auth.uid() OR public.same_department(auth.uid(), id))
  )
);

-- profiles: UPDATE self
DROP POLICY IF EXISTS "update own limited profile" ON public.profiles;
CREATE POLICY "update own limited profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() AND public.is_approved(auth.uid()))
WITH CHECK (id = auth.uid() AND public.is_approved(auth.uid()));

-- break_logs: SELECT
DROP POLICY IF EXISTS "view breaks (self / dept / mgr)" ON public.break_logs;
CREATE POLICY "view breaks (self / dept / mgr)"
ON public.break_logs FOR SELECT TO authenticated
USING (
  public.is_admin_or_manager(auth.uid())
  OR (
    public.is_approved(auth.uid())
    AND (user_id = auth.uid() OR public.same_department(auth.uid(), user_id))
  )
);

-- break_logs: INSERT
DROP POLICY IF EXISTS "create own break" ON public.break_logs;
CREATE POLICY "create own break"
ON public.break_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()));

-- break_logs: UPDATE own
DROP POLICY IF EXISTS "update own open break" ON public.break_logs;
CREATE POLICY "update own open break"
ON public.break_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.is_approved(auth.uid()))
WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()));

-- messages: SELECT
DROP POLICY IF EXISTS "view own conversations" ON public.messages;
CREATE POLICY "view own conversations"
ON public.messages FOR SELECT TO authenticated
USING (
  public.is_approved(auth.uid())
  AND (sender_id = auth.uid() OR recipient_id = auth.uid())
);

-- messages: INSERT (preserve dept + chat-enabled checks, add approved)
DROP POLICY IF EXISTS "send as self (same dept, chat on)" ON public.messages;
CREATE POLICY "send as self (same dept, chat on)"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_approved(auth.uid())
  AND (public.is_admin_or_manager(auth.uid()) OR public.same_department(auth.uid(), recipient_id))
  AND (
    public.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dept_chat_settings dcs
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE dcs.department = p.department AND dcs.enabled = true
    )
  )
);

-- 3) Lock down internal trigger / maintenance functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_concurrent_out() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_privileged_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cascade_department_rename() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_messages() FROM PUBLIC, anon, authenticated;
