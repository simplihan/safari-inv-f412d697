
-- 1) Tighten profiles SELECT policy — remove dept-peer access to sensitive fields
DROP POLICY IF EXISTS "view profile (self / dept / mgr)" ON public.profiles;

CREATE POLICY "view profile self or privileged"
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR private.is_admin_or_manager(auth.uid())
  );

-- 2) Safe directory view for approved peers (non-sensitive cols only)
DROP VIEW IF EXISTS public.profiles_directory;
CREATE VIEW public.profiles_directory
WITH (security_invoker = false) AS
SELECT id, full_name, department, profile_image, status
FROM public.profiles
WHERE status = 'approved';

REVOKE ALL ON public.profiles_directory FROM PUBLIC, anon;
GRANT SELECT ON public.profiles_directory TO authenticated;
GRANT ALL ON public.profiles_directory TO service_role;

-- 3) Tighten realtime: departments events only to approved users
DROP POLICY IF EXISTS "authenticated can receive own realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive own realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    private.is_approved(auth.uid())
    AND extension = 'postgres_changes'
    AND (
      (((payload -> 'data') ->> 'table') = 'profiles' AND (
        ((((payload -> 'data') -> 'record') ->> 'id')::uuid = auth.uid())
        OR private.is_admin_or_manager(auth.uid())
      ))
      OR (((payload -> 'data') ->> 'table') = 'break_logs' AND (
        ((((payload -> 'data') -> 'record') ->> 'user_id')::uuid = auth.uid())
        OR private.is_admin_or_manager(auth.uid())
        OR private.same_department(auth.uid(), (((payload -> 'data') -> 'record') ->> 'user_id')::uuid)
      ))
      OR (((payload -> 'data') ->> 'table') = 'messages' AND (
        ((((payload -> 'data') -> 'record') ->> 'sender_id')::uuid = auth.uid())
        OR ((((payload -> 'data') -> 'record') ->> 'recipient_id')::uuid = auth.uid())
      ))
      OR (((payload -> 'data') ->> 'table') = 'dept_chat_settings' AND (
        private.is_admin_or_manager(auth.uid())
        OR (((payload -> 'data') -> 'record') ->> 'department') = (
          SELECT department FROM public.profiles WHERE id = auth.uid()
        )
      ))
      OR (((payload -> 'data') ->> 'table') = 'departments'
          AND private.is_approved(auth.uid()))
    )
  );
