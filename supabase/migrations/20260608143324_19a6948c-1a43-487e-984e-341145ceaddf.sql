CREATE OR REPLACE FUNCTION public.auto_close_stale_breaks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.break_logs
  SET status = 'in',
      in_time = out_time + INTERVAL '120 minutes',
      duration_minutes = 120,
      remarks = COALESCE(NULLIF(remarks, ''), '') ||
        CASE WHEN COALESCE(remarks,'')='' THEN '' ELSE ' | ' END ||
        'Auto Timeout'
  WHERE status = 'out'
    AND out_time < now() - INTERVAL '120 minutes';
$function$;