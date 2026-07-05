
-- 1) Departments: replace broad anon SELECT with a dedicated RPC
DROP POLICY IF EXISTS "public can view departments for access requests" ON public.departments;

CREATE OR REPLACE FUNCTION public.list_departments_public()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.departments ORDER BY name;
$$;

REVOKE ALL ON FUNCTION public.list_departments_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_departments_public() TO anon, authenticated;

-- 2) message_hidden: explicit deny-UPDATE policy for defense in depth
DROP POLICY IF EXISTS "no updates on message_hidden" ON public.message_hidden;
CREATE POLICY "no updates on message_hidden"
  ON public.message_hidden
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);
