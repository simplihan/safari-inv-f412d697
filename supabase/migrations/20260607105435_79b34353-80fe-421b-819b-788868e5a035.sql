
-- Fix 1: Restrict anonymous SELECT on departments to only id and name columns
REVOKE SELECT ON public.departments FROM anon;
GRANT SELECT (id, name) ON public.departments TO anon;

-- Fix 2: Prevent managers from changing privileged profile fields (status, email, sgc_id, department, id).
-- Only admins may modify these. Managers can still update other fields (e.g. full_name, mobile, profile_image).
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
BEGIN
  -- Admins bypass all checks
  IF auth.uid() IS NOT NULL AND private.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Everyone else (including managers) cannot modify privileged fields
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not allowed to change status' USING ERRCODE = 'insufficient_privilege';
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
