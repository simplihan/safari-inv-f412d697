CREATE OR REPLACE FUNCTION public.enforce_max_concurrent_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  out_count INT;
  user_dept TEXT;
BEGIN
  IF NEW.status = 'out' AND NEW.reason <> 'Lunch' THEN
    -- Admins and managers are exempt from the concurrency cap
    IF NEW.user_id IS NOT NULL AND (
      private.has_role(NEW.user_id, 'admin'::app_role) OR
      private.has_role(NEW.user_id, 'manager'::app_role)
    ) THEN
      RETURN NEW;
    END IF;

    SELECT department INTO user_dept FROM public.profiles WHERE id = NEW.user_id;

    IF user_dept IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO out_count
    FROM public.break_logs bl
    JOIN public.profiles p ON p.id = bl.user_id
    WHERE bl.status = 'out'
      AND bl.reason <> 'Lunch'
      AND p.department = user_dept
      AND NOT private.has_role(bl.user_id, 'admin'::app_role)
      AND NOT private.has_role(bl.user_id, 'manager'::app_role);
    IF out_count >= 8 THEN
      RAISE EXCEPTION '8 staff members from your department are already out. Please wait for them to return before stepping out.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;