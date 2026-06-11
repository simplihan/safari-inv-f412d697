DROP POLICY IF EXISTS "authenticated can receive own realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive own realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    private.is_approved(auth.uid())
    AND extension = 'postgres_changes'
    AND (
      (COALESCE(((payload -> 'data') ->> 'table'), '') = 'profiles' AND (
        (COALESCE(((payload -> 'data') -> 'record') ->> 'id',
                  ((payload -> 'data') -> 'old_record') ->> 'id'))::uuid = auth.uid()
        OR private.is_admin_or_manager(auth.uid())
      ))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'break_logs' AND (
        (COALESCE(((payload -> 'data') -> 'record') ->> 'user_id',
                  ((payload -> 'data') -> 'old_record') ->> 'user_id'))::uuid = auth.uid()
        OR private.is_admin_or_manager(auth.uid())
        OR private.same_department(auth.uid(),
             (COALESCE(((payload -> 'data') -> 'record') ->> 'user_id',
                       ((payload -> 'data') -> 'old_record') ->> 'user_id'))::uuid)
      ))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'messages' AND (
        (COALESCE(((payload -> 'data') -> 'record') ->> 'sender_id',
                  ((payload -> 'data') -> 'old_record') ->> 'sender_id'))::uuid = auth.uid()
        OR (COALESCE(((payload -> 'data') -> 'record') ->> 'recipient_id',
                     ((payload -> 'data') -> 'old_record') ->> 'recipient_id'))::uuid = auth.uid()
      ))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'dept_chat_settings' AND (
        private.is_admin_or_manager(auth.uid())
        OR COALESCE(((payload -> 'data') -> 'record') ->> 'department',
                    ((payload -> 'data') -> 'old_record') ->> 'department') = (
          SELECT department FROM public.profiles WHERE id = auth.uid()
        )
      ))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'departments'
          AND private.is_approved(auth.uid()))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'notifications' AND (
        COALESCE(((payload -> 'data') -> 'record') ->> 'scope',
                 ((payload -> 'data') -> 'old_record') ->> 'scope') = 'global'
        OR private.is_admin_or_manager(auth.uid())
        OR COALESCE(((payload -> 'data') -> 'record') ->> 'department',
                    ((payload -> 'data') -> 'old_record') ->> 'department') = (
          SELECT department FROM public.profiles WHERE id = auth.uid()
        )
      ))
      OR (COALESCE(((payload -> 'data') ->> 'table'), '') = 'notification_reads' AND (
        (COALESCE(((payload -> 'data') -> 'record') ->> 'user_id',
                  ((payload -> 'data') -> 'old_record') ->> 'user_id'))::uuid = auth.uid()
        OR private.has_role(auth.uid(), 'admin'::app_role)
      ))
    )
  );