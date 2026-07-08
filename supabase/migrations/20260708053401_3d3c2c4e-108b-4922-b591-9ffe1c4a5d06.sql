CREATE OR REPLACE FUNCTION public.log_profile_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  meaningful_change boolean;
BEGIN
  meaningful_change := (
    NEW.full_name IS DISTINCT FROM OLD.full_name OR
    NEW.email IS DISTINCT FROM OLD.email OR
    NEW.mobile IS DISTINCT FROM OLD.mobile OR
    NEW.department IS DISTINCT FROM OLD.department OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.profile_image IS DISTINCT FROM OLD.profile_image OR
    NEW.notif_enabled IS DISTINCT FROM OLD.notif_enabled OR
    NEW.sgc_id IS DISTINCT FROM OLD.sgc_id
  );

  IF NOT meaningful_change THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, payload)
  VALUES (
    auth.uid(),
    TG_OP,
    'profiles',
    COALESCE(NEW.id::text, ''),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_profiles_update
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_audit_change();