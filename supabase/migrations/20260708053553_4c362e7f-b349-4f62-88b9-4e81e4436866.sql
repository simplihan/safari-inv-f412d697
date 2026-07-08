DROP TRIGGER IF EXISTS audit_profiles_update ON public.profiles;
DROP TRIGGER IF EXISTS audit_profiles ON public.profiles;

CREATE TRIGGER audit_profiles_insert_delete
AFTER INSERT OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_audit_change('profiles');

CREATE TRIGGER audit_profiles_update
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_audit_change();