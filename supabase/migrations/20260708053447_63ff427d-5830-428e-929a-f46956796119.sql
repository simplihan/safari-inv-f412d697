REVOKE ALL ON FUNCTION public.log_profile_audit_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_profile_audit_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_audit_change() TO service_role;