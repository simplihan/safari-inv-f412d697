
-- departments: require approval for authenticated SELECT (anon still has GRANT for registration page)
DROP POLICY IF EXISTS "anyone signed in can view departments" ON public.departments;
CREATE POLICY "approved users can view departments"
ON public.departments FOR SELECT TO authenticated
USING (public.is_admin_or_manager(auth.uid()) OR public.is_approved(auth.uid()));

-- dept_chat_settings: require approval
DROP POLICY IF EXISTS "view chat settings" ON public.dept_chat_settings;
CREATE POLICY "view chat settings"
ON public.dept_chat_settings FOR SELECT TO authenticated
USING (public.is_admin_or_manager(auth.uid()) OR public.is_approved(auth.uid()));

-- login_events: require approval on insert
DROP POLICY IF EXISTS "insert own login event" ON public.login_events;
CREATE POLICY "insert own login event"
ON public.login_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_approved(auth.uid()));

-- messages: require approval on delete
DROP POLICY IF EXISTS "delete own sent" ON public.messages;
CREATE POLICY "delete own sent"
ON public.messages FOR DELETE TO authenticated
USING (sender_id = auth.uid() AND public.is_approved(auth.uid()));

-- messages: require approval on delivered/read updates
DROP POLICY IF EXISTS "mark received as delivered" ON public.messages;
CREATE POLICY "mark received as delivered"
ON public.messages FOR UPDATE TO authenticated
USING (recipient_id = auth.uid() AND public.is_approved(auth.uid()))
WITH CHECK (recipient_id = auth.uid() AND public.is_approved(auth.uid()));

DROP POLICY IF EXISTS "mark received as read" ON public.messages;
CREATE POLICY "mark received as read"
ON public.messages FOR UPDATE TO authenticated
USING (recipient_id = auth.uid() AND public.is_approved(auth.uid()))
WITH CHECK (recipient_id = auth.uid() AND public.is_approved(auth.uid()));

-- realtime: require approval before receiving any payload
DROP POLICY IF EXISTS "authenticated can receive own realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive own realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (
  public.is_approved(auth.uid())
  AND extension = 'postgres_changes'
  AND (
    (((payload -> 'data') ->> 'table') = 'profiles' AND (
      ((((payload -> 'data') -> 'record') ->> 'id'))::uuid = auth.uid()
      OR public.is_admin_or_manager(auth.uid())
      OR public.same_department(auth.uid(), ((((payload -> 'data') -> 'record') ->> 'id'))::uuid)
    ))
    OR (((payload -> 'data') ->> 'table') = 'break_logs' AND (
      ((((payload -> 'data') -> 'record') ->> 'user_id'))::uuid = auth.uid()
      OR public.is_admin_or_manager(auth.uid())
      OR public.same_department(auth.uid(), ((((payload -> 'data') -> 'record') ->> 'user_id'))::uuid)
    ))
    OR (((payload -> 'data') ->> 'table') = 'messages' AND (
      ((((payload -> 'data') -> 'record') ->> 'sender_id'))::uuid = auth.uid()
      OR ((((payload -> 'data') -> 'record') ->> 'recipient_id'))::uuid = auth.uid()
    ))
  )
);
