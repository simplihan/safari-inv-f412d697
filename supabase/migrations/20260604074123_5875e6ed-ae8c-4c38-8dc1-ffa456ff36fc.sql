
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Self can insert audit logs" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());
