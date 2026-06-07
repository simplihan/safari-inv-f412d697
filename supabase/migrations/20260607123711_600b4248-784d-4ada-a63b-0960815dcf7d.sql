-- 1) Restrict cross-user profile UPDATE to admins only (managers can no longer
--    update other users' profiles, eliminating the privilege-escalation surface
--    on status/department/email columns).
DROP POLICY IF EXISTS "managers update any profile" ON public.profiles;

CREATE POLICY "admins update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- 2) Restrict login_events SELECT to admins and self only (no manager dept access).
DROP POLICY IF EXISTS "view own or dept login events" ON public.login_events;

CREATE POLICY "view own or admin login events"
ON public.login_events FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (user_id = auth.uid() AND private.is_approved(auth.uid()))
);
