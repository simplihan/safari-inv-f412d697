CREATE OR REPLACE FUNCTION public.list_visible_user_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  is_admin boolean;
  is_manager boolean;
  is_supervisor boolean;
  allowed app_role[];
BEGIN
  IF me IS NULL THEN RETURN; END IF;

  is_admin := private.has_role(me, 'admin'::app_role);
  is_manager := private.has_role(me, 'manager'::app_role);
  is_supervisor := private.has_role(me, 'supervisor'::app_role);

  IF is_admin THEN
    allowed := ARRAY['admin','manager','supervisor','staff']::app_role[];
  ELSIF is_manager THEN
    allowed := ARRAY['manager','supervisor','staff']::app_role[];
  ELSIF is_supervisor THEN
    allowed := ARRAY['supervisor','staff']::app_role[];
  ELSE
    allowed := ARRAY['staff']::app_role[];
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE
    p.id = me
    OR (
      -- exclude admins for non-admin viewers
      (is_admin OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role = 'admin'
      ))
      AND (is_admin OR private.same_department(me, p.id))
      AND (
        COALESCE(ur.role, 'staff'::app_role) = ANY(allowed)
      )
    );
END;
$function$;