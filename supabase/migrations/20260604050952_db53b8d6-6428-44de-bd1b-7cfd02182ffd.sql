ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

CREATE OR REPLACE FUNCTION private.is_admin_or_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'manager', 'supervisor')
  );
$function$;

GRANT EXECUTE ON FUNCTION private.is_admin_or_manager(uuid) TO authenticated, service_role;