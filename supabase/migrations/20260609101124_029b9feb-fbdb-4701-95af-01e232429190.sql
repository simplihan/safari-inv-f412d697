CREATE OR REPLACE FUNCTION public.enforce_max_concurrent_out()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  out_count INT;
BEGIN
  IF NEW.status = 'out' AND NEW.reason <> 'Lunch' THEN
    SELECT COUNT(*) INTO out_count
    FROM public.break_logs
    WHERE status = 'out' AND reason <> 'Lunch';
    IF out_count >= 5 THEN
      RAISE EXCEPTION '5 staff members are already out. Please wait for them to return before stepping out.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;