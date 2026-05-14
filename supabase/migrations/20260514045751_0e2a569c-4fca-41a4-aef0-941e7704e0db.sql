CREATE OR REPLACE FUNCTION public.enforce_max_concurrent_out()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  out_count INT;
BEGIN
  IF NEW.status = 'out' THEN
    SELECT COUNT(*) INTO out_count FROM public.break_logs WHERE status = 'out';
    IF out_count >= 5 THEN
      RAISE EXCEPTION 'Wait — 5 people are already outside.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_concurrent_out ON public.break_logs;
CREATE TRIGGER trg_max_concurrent_out
BEFORE INSERT ON public.break_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_concurrent_out();