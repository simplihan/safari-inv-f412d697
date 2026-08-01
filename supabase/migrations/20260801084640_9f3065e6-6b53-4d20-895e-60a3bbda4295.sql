-- Column-level read restriction: hide monthly_report_recipients from regular users
REVOKE SELECT ON public.departments FROM authenticated;
REVOKE SELECT ON public.departments FROM anon;

GRANT SELECT (id, name, created_at, updated_at, monthly_report_email, monthly_report_subject)
  ON public.departments TO authenticated;

GRANT ALL ON public.departments TO service_role;

-- Admin-only accessor for the sensitive recipient column
CREATE OR REPLACE FUNCTION public.list_department_report_recipients()
RETURNS TABLE(id uuid, monthly_report_recipients text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT d.id, d.monthly_report_recipients FROM public.departments d;
END;
$$;

REVOKE ALL ON FUNCTION public.list_department_report_recipients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_department_report_recipients() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_department_report_recipients() TO authenticated;