DROP POLICY IF EXISTS "approved_can_read_user_departments" ON public.user_departments;

CREATE POLICY "user_departments_scoped_read"
  ON public.user_departments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND private.is_approved(auth.uid())
    AND (
      user_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'manager'::app_role)
      OR private.has_role(auth.uid(), 'supervisor'::app_role)
      OR private.same_department(auth.uid(), user_id)
    )
  );