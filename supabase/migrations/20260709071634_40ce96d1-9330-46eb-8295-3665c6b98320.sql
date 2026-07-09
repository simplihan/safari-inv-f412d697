
CREATE OR REPLACE FUNCTION public.touch_last_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.profiles SET last_seen_at = now(), is_online = true WHERE id = auth.uid();
$function$;
