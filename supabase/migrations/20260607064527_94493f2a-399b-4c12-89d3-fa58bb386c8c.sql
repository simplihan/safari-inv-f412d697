
-- 1) Constrain self-insert profile to status='pending'
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND status = 'pending');

-- 2) Drop coarse realtime policy; rely on record-scoped policy
DROP POLICY IF EXISTS "Approved users receive scoped realtime" ON realtime.messages;

-- 3) Scope login_events SELECT: admin all, manager own dept, user own
DROP POLICY IF EXISTS "view own or dept login events" ON public.login_events;
CREATE POLICY "view own or dept login events"
ON public.login_events FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR (user_id = auth.uid() AND private.is_approved(auth.uid()))
  OR (
    private.has_role(auth.uid(), 'manager'::app_role)
    AND private.same_department(auth.uid(), user_id)
  )
);
