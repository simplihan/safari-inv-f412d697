CREATE OR REPLACE FUNCTION public.enforce_max_concurrent_out()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  out_count INT;
BEGIN
  IF NEW.status = 'out' THEN
    SELECT COUNT(*) INTO out_count FROM public.break_logs WHERE status = 'out';
    IF out_count >= 8 THEN
      RAISE EXCEPTION '8 staff members are already out. Please wait for them to return before stepping out.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;