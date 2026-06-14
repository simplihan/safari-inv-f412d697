CREATE OR REPLACE FUNCTION public.enforce_max_concurrent_out()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  out_count INT;
BEGIN
  IF NEW.status = 'out' THEN
    SELECT COUNT(*) INTO out_count FROM public.break_logs WHERE status = 'out';
    IF out_count >= 8 THEN
      RAISE EXCEPTION 'Wait — 8 people are already outside.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;