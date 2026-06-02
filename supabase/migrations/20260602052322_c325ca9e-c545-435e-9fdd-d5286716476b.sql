CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_admin_or_manager(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_approved(uuid) SET SCHEMA private;
ALTER FUNCTION public.same_department(uuid, uuid) SET SCHEMA private;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin_or_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_approved(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.same_department(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR private.is_admin_or_manager(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not allowed to change status' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Not allowed to change email' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.sgc_id IS DISTINCT FROM OLD.sgc_id THEN
    RAISE EXCEPTION 'Not allowed to change SGC ID' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.department IS DISTINCT FROM OLD.department THEN
    RAISE EXCEPTION 'Not allowed to change department' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Not allowed to change id' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "admin update break" ON public.break_logs;
CREATE POLICY "admin update break" ON public.break_logs
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin delete break" ON public.break_logs;
CREATE POLICY "admin delete break" ON public.break_logs
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "view breaks (self / dept / mgr)" ON public.break_logs;
CREATE POLICY "view breaks (self / dept / mgr)" ON public.break_logs
FOR SELECT TO authenticated
USING (
  private.is_admin_or_manager(auth.uid())
  OR (
    private.is_approved(auth.uid())
    AND (user_id = auth.uid() OR private.same_department(auth.uid(), user_id))
  )
);

DROP POLICY IF EXISTS "create own break" ON public.break_logs;
CREATE POLICY "create own break" ON public.break_logs
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "update own open break" ON public.break_logs;
CREATE POLICY "update own open break" ON public.break_logs
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND private.is_approved(auth.uid()))
WITH CHECK (user_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "admin manages departments" ON public.departments;
CREATE POLICY "admin manages departments" ON public.departments
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "approved users can view departments" ON public.departments;
CREATE POLICY "approved users can view departments" ON public.departments
FOR SELECT TO authenticated
USING (private.is_admin_or_manager(auth.uid()) OR private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "admin manage chat settings" ON public.dept_chat_settings;
CREATE POLICY "admin manage chat settings" ON public.dept_chat_settings
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "manager toggle own dept chat" ON public.dept_chat_settings;
CREATE POLICY "manager toggle own dept chat" ON public.dept_chat_settings
FOR ALL TO authenticated
USING (
  private.has_role(auth.uid(), 'manager'::public.app_role)
  AND department = (SELECT p.department FROM public.profiles p WHERE p.id = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'manager'::public.app_role)
  AND department = (SELECT p.department FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "view chat settings" ON public.dept_chat_settings;
CREATE POLICY "view chat settings" ON public.dept_chat_settings
FOR SELECT TO authenticated
USING (private.is_admin_or_manager(auth.uid()) OR private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "view own or dept login events" ON public.login_events;
CREATE POLICY "view own or dept login events" ON public.login_events
FOR SELECT TO authenticated
USING (
  private.is_admin_or_manager(auth.uid())
  OR (
    private.is_approved(auth.uid())
    AND (user_id = auth.uid() OR private.same_department(auth.uid(), user_id))
  )
);

DROP POLICY IF EXISTS "insert own login event" ON public.login_events;
CREATE POLICY "insert own login event" ON public.login_events
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "view own conversations" ON public.messages;
CREATE POLICY "view own conversations" ON public.messages
FOR SELECT TO authenticated
USING (private.is_approved(auth.uid()) AND (sender_id = auth.uid() OR recipient_id = auth.uid()));

DROP POLICY IF EXISTS "send as self (same dept, chat on)" ON public.messages;
CREATE POLICY "send as self (same dept, chat on)" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND private.is_approved(auth.uid())
  AND (private.is_admin_or_manager(auth.uid()) OR private.same_department(auth.uid(), recipient_id))
  AND (
    private.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.dept_chat_settings dcs
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE dcs.department = p.department AND dcs.enabled = true
    )
  )
);

DROP POLICY IF EXISTS "delete own sent" ON public.messages;
CREATE POLICY "delete own sent" ON public.messages
FOR DELETE TO authenticated
USING (sender_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "mark received as delivered" ON public.messages;
CREATE POLICY "mark received as delivered" ON public.messages
FOR UPDATE TO authenticated
USING (recipient_id = auth.uid() AND private.is_approved(auth.uid()))
WITH CHECK (recipient_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "mark received as read" ON public.messages;
CREATE POLICY "mark received as read" ON public.messages
FOR UPDATE TO authenticated
USING (recipient_id = auth.uid() AND private.is_approved(auth.uid()))
WITH CHECK (recipient_id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "authenticated can receive own realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive own realtime" ON realtime.messages
FOR SELECT TO authenticated
USING (
  private.is_approved(auth.uid())
  AND extension = 'postgres_changes'
  AND (
    (
      payload->'data'->>'table' = 'profiles'
      AND (
        ((payload->'data'->'record'->>'id')::uuid = auth.uid())
        OR private.is_admin_or_manager(auth.uid())
        OR private.same_department(auth.uid(), (payload->'data'->'record'->>'id')::uuid)
      )
    )
    OR (
      payload->'data'->>'table' = 'break_logs'
      AND (
        ((payload->'data'->'record'->>'user_id')::uuid = auth.uid())
        OR private.is_admin_or_manager(auth.uid())
        OR private.same_department(auth.uid(), (payload->'data'->'record'->>'user_id')::uuid)
      )
    )
    OR (
      payload->'data'->>'table' = 'messages'
      AND (
        ((payload->'data'->'record'->>'sender_id')::uuid = auth.uid())
        OR ((payload->'data'->'record'->>'recipient_id')::uuid = auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "managers update any profile" ON public.profiles;
CREATE POLICY "managers update any profile" ON public.profiles
FOR UPDATE TO authenticated
USING (private.is_admin_or_manager(auth.uid()))
WITH CHECK (private.is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "admin delete profile" ON public.profiles;
CREATE POLICY "admin delete profile" ON public.profiles
FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "view profile (self / dept / mgr)" ON public.profiles;
CREATE POLICY "view profile (self / dept / mgr)" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.is_admin_or_manager(auth.uid())
  OR (private.is_approved(auth.uid()) AND private.same_department(auth.uid(), id))
);

DROP POLICY IF EXISTS "update own limited profile" ON public.profiles;
CREATE POLICY "update own limited profile" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() AND private.is_approved(auth.uid()))
WITH CHECK (id = auth.uid() AND private.is_approved(auth.uid()));

DROP POLICY IF EXISTS "view own roles" ON public.user_roles;
CREATE POLICY "view own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_admin_or_manager(auth.uid()));

DROP POLICY IF EXISTS "admin manage roles" ON public.user_roles;
CREATE POLICY "admin manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));