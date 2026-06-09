
-- 1) Restrict managers/supervisors to status-only updates on same-dept profiles.
DROP POLICY IF EXISTS "managers update same-dept status" ON public.profiles;

CREATE POLICY "managers update same-dept status"
  ON public.profiles
  FOR UPDATE
  USING (
    private.is_admin_or_manager(auth.uid())
    AND private.same_department(auth.uid(), id)
  )
  WITH CHECK (
    private.is_admin_or_manager(auth.uid())
    AND private.same_department(auth.uid(), id)
    -- Pin every non-status field to its current value. Only status may change.
    AND id           = (SELECT p.id           FROM public.profiles p WHERE p.id = profiles.id)
    AND email        = (SELECT p.email        FROM public.profiles p WHERE p.id = profiles.id)
    AND full_name    = (SELECT p.full_name    FROM public.profiles p WHERE p.id = profiles.id)
    AND department   IS NOT DISTINCT FROM (SELECT p.department    FROM public.profiles p WHERE p.id = profiles.id)
    AND sgc_id       IS NOT DISTINCT FROM (SELECT p.sgc_id        FROM public.profiles p WHERE p.id = profiles.id)
    AND mobile       IS NOT DISTINCT FROM (SELECT p.mobile        FROM public.profiles p WHERE p.id = profiles.id)
    AND profile_image IS NOT DISTINCT FROM (SELECT p.profile_image FROM public.profiles p WHERE p.id = profiles.id)
    AND notif_enabled IS NOT DISTINCT FROM (SELECT p.notif_enabled FROM public.profiles p WHERE p.id = profiles.id)
  );

-- 2) Realtime: cover DELETE events (which use old_record instead of record).
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
    )
  );
