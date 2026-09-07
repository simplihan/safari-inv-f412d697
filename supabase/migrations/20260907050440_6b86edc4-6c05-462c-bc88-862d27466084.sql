CREATE OR REPLACE FUNCTION public.auto_add_lunch_breaks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'Asia/Qatar')::date;
  lunch_out timestamptz := ((d::text || ' 13:00:00')::timestamp AT TIME ZONE 'Asia/Qatar');
  lunch_in timestamptz := ((d::text || ' 14:00:00')::timestamp AT TIME ZONE 'Asia/Qatar');
BEGIN
  INSERT INTO public.break_logs (user_id, reason, remarks, out_time, in_time, duration_minutes, status)
  SELECT DISTINCT le.user_id, 'Lunch'::break_reason, 'Auto Lunch', lunch_out, lunch_in, 60, 'in'
  FROM public.login_events le
  JOIN public.profiles p ON p.id = le.user_id AND p.status = 'approved'
  WHERE (le.created_at AT TIME ZONE 'Asia/Qatar')::date = d
    AND NOT EXISTS (
      SELECT 1 FROM public.break_logs bl
      WHERE bl.user_id = le.user_id
        AND bl.reason = 'Lunch'::break_reason
        AND (bl.out_time AT TIME ZONE 'Asia/Qatar')::date = d
    );
END;
$$;

SELECT cron.schedule(
  'auto-add-lunch-breaks',
  '5 11 * * *',
  $$SELECT public.auto_add_lunch_breaks();$$
);