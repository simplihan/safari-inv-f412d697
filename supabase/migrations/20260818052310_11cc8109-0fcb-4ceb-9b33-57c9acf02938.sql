ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;

DROP FUNCTION IF EXISTS public.list_directory();

CREATE OR REPLACE FUNCTION public.list_directory()
 RETURNS TABLE(id uuid, full_name text, department text, profile_image text, status user_status, last_seen_at timestamp with time zone, is_online boolean, birth_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, full_name, department, profile_image, status, last_seen_at, is_online, birth_date
  FROM public.profiles
  WHERE status = 'approved'
    AND auth.uid() IS NOT NULL
    AND private.is_approved(auth.uid());
$function$;