DROP POLICY IF EXISTS "Public registration status" ON public.registration_settings;
REVOKE SELECT ON public.registration_settings FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_enabled() TO anon, authenticated;