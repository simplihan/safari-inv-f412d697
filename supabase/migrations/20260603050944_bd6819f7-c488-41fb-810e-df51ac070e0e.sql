
-- Make handle_new_user resilient: never block auth.admin.createUser
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, full_name, email, sgc_id, mobile, department, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      NEW.raw_user_meta_data->>'sgc_id',
      NEW.raw_user_meta_data->>'mobile',
      NEW.raw_user_meta_data->>'department',
      'pending'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user profiles insert failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'staff')
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user user_roles insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- pg_cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Auto-close break entries open longer than 2 hours
CREATE OR REPLACE FUNCTION public.auto_close_stale_breaks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.break_logs
  SET status = 'in',
      in_time = out_time + INTERVAL '2 hours',
      duration_minutes = 120,
      remarks = COALESCE(NULLIF(remarks, ''), '') ||
        CASE WHEN COALESCE(remarks,'')='' THEN '' ELSE ' | ' END ||
        '[auto-closed after 2h]'
  WHERE status = 'out'
    AND out_time < now() - INTERVAL '2 hours';
$$;

-- Daily purge of break logs older than 90 days
CREATE OR REPLACE FUNCTION public.cleanup_old_break_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.break_logs WHERE created_at < now() - INTERVAL '90 days';
$$;

-- (re)schedule cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-stale-breaks');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('auto-close-stale-breaks', '*/5 * * * *', $$SELECT public.auto_close_stale_breaks();$$);

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-break-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('cleanup-old-break-logs', '0 3 * * *', $$SELECT public.cleanup_old_break_logs();$$);
