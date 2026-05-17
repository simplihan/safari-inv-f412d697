
-- Lock down SECURITY DEFINER helpers from direct API execution
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.same_department(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
-- get_email_by_sgc must remain callable by anon for SGC-ID login
REVOKE EXECUTE ON FUNCTION public.get_email_by_sgc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_sgc(text) TO anon, authenticated;

-- Enable RLS on realtime.messages and scope subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can receive own realtime" ON realtime.messages;
CREATE POLICY "authenticated can receive own realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Only allow change events that belong to the calling user's allowed scope.
  -- profiles: self, same dept, or admin/manager
  (
    extension = 'postgres_changes'
    AND (
      (
        (payload->'data'->>'table') = 'profiles'
        AND (
          ((payload->'data'->'record'->>'id')::uuid = auth.uid())
          OR public.is_admin_or_manager(auth.uid())
          OR public.same_department(auth.uid(), (payload->'data'->'record'->>'id')::uuid)
        )
      )
      OR (
        (payload->'data'->>'table') = 'break_logs'
        AND (
          ((payload->'data'->'record'->>'user_id')::uuid = auth.uid())
          OR public.is_admin_or_manager(auth.uid())
          OR public.same_department(auth.uid(), (payload->'data'->'record'->>'user_id')::uuid)
        )
      )
      OR (
        (payload->'data'->>'table') = 'messages'
        AND (
          ((payload->'data'->'record'->>'sender_id')::uuid = auth.uid())
          OR ((payload->'data'->'record'->>'recipient_id')::uuid = auth.uid())
        )
      )
    )
  )
);
