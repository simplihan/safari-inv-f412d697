CREATE OR REPLACE FUNCTION public.auto_add_lunch_breaks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := (now() AT TIME ZONE 'Asia/Qatar')::date;
  lunch_out timestamptz := ((d::text || ' 13:00:00')::timestamp AT TIME ZONE 'Asia/Qatar');
  lunch_in timestamptz := ((d::text || ' 14:00:00')::timestamp AT TIME ZONE 'Asia/Qatar');
BEGIN
  INSERT INTO public.break_logs (user_id, reason, remarks, out_time, in_time, duration_minutes, status)
  SELECT p.id, 'Lunch'::break_reason, 'Auto Lunch', lunch_out, lunch_in, 60, 'in'
  FROM public.profiles p
  WHERE p.status = 'approved'
    AND (
      EXISTS (SELECT 1 FROM public.login_events le WHERE le.user_id = p.id AND (le.created_at AT TIME ZONE 'Asia/Qatar')::date = d)
      OR EXISTS (SELECT 1 FROM public.break_logs b WHERE b.user_id = p.id AND (b.out_time AT TIME ZONE 'Asia/Qatar')::date = d)
      OR (p.last_seen_at IS NOT NULL AND (p.last_seen_at AT TIME ZONE 'Asia/Qatar')::date = d)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.break_logs bl
      WHERE bl.user_id = p.id AND bl.reason = 'Lunch'::break_reason
        AND (bl.out_time AT TIME ZONE 'Asia/Qatar')::date = d
    );
END; $$;

SELECT public.auto_add_lunch_breaks();