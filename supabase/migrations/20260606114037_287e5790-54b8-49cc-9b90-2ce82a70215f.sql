
-- 1) profiles: replace self-update policy with explicit column guards
DROP POLICY IF EXISTS "update own limited profile" ON public.profiles;
CREATE POLICY "update own limited profile" ON public.profiles
FOR UPDATE
USING ((id = auth.uid()) AND private.is_approved(auth.uid()))
WITH CHECK (
  (id = auth.uid())
  AND private.is_approved(auth.uid())
  AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
  AND department IS NOT DISTINCT FROM (SELECT department FROM public.profiles WHERE id = auth.uid())
  AND email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  AND sgc_id IS NOT DISTINCT FROM (SELECT sgc_id FROM public.profiles WHERE id = auth.uid())
);

-- 2) dept_chat_settings: manager limited to UPDATE only
DROP POLICY IF EXISTS "manager toggle own dept chat" ON public.dept_chat_settings;
CREATE POLICY "manager toggle own dept chat" ON public.dept_chat_settings
FOR UPDATE
USING (
  private.has_role(auth.uid(), 'manager'::app_role)
  AND department = (SELECT p.department FROM public.profiles p WHERE p.id = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'manager'::app_role)
  AND department = (SELECT p.department FROM public.profiles p WHERE p.id = auth.uid())
);

-- 3) login_events: restrict dept visibility to admins/managers only
DROP POLICY IF EXISTS "view own or dept login events" ON public.login_events;
CREATE POLICY "view own or dept login events" ON public.login_events
FOR SELECT
USING (
  private.is_admin_or_manager(auth.uid())
  OR (private.is_approved(auth.uid()) AND user_id = auth.uid())
);
