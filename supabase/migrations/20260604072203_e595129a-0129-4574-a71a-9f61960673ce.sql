
-- 1. Partial unique index: at most one open activity per user
CREATE UNIQUE INDEX IF NOT EXISTS uniq_break_logs_one_open_per_user
  ON public.break_logs(user_id) WHERE status = 'out';

-- 2. Auto-close after 60 minutes, tag "Auto Timeout"
CREATE OR REPLACE FUNCTION public.auto_close_stale_breaks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.break_logs
  SET status = 'in',
      in_time = out_time + INTERVAL '60 minutes',
      duration_minutes = 60,
      remarks = COALESCE(NULLIF(remarks, ''), '') ||
        CASE WHEN COALESCE(remarks,'')='' THEN '' ELSE ' | ' END ||
        'Auto Timeout'
  WHERE status = 'out'
    AND out_time < now() - INTERVAL '60 minutes';
$$;

-- 3. Schedule via pg_cron every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-stale-breaks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-close-stale-breaks',
  '*/5 * * * *',
  $$ SELECT public.auto_close_stale_breaks(); $$
);
