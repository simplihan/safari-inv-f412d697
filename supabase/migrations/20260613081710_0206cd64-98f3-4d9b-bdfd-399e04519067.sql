
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  is_admin boolean := auth.uid() IS NOT NULL AND private.has_role(auth.uid(), 'admin');
  is_mgr boolean := auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'supervisor')
  );
BEGIN
  -- Service-role / server admin operations (no auth.uid()) bypass these guards.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (is_mgr AND private.same_department(auth.uid(), OLD.id)) THEN
      RAISE EXCEPTION 'Not allowed to change status' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Not allowed to change email' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.sgc_id IS DISTINCT FROM OLD.sgc_id THEN
    RAISE EXCEPTION 'Not allowed to change SGC ID' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.department IS DISTINCT FROM OLD.department THEN
    RAISE EXCEPTION 'Not allowed to change department' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Not allowed to change id' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
