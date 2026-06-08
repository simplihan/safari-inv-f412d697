
DROP VIEW IF EXISTS public.profiles_directory;

CREATE OR REPLACE FUNCTION public.list_directory()
RETURNS TABLE (
  id uuid,
  full_name text,
  department text,
  profile_image text,
  status user_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, department, profile_image, status
  FROM public.profiles
  WHERE status = 'approved'
    AND auth.uid() IS NOT NULL
    AND private.is_approved(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.list_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_directory() TO authenticated;
