DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins and audit permission holders read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_permission(auth.uid(), 'view_audit'::app_permission)
);

DROP POLICY IF EXISTS "Admins delete audit logs" ON public.audit_logs;
CREATE POLICY "Admins and audit editors delete audit logs"
ON public.audit_logs FOR DELETE TO authenticated
USING (
  private.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_edit_permission(auth.uid(), 'view_audit'::app_permission)
);