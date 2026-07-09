
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_online()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET is_online = true, last_seen_at = now() WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.set_offline()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET is_online = false, last_seen_at = now() WHERE id = auth.uid();
$$;

DROP FUNCTION IF EXISTS public.list_directory();

CREATE OR REPLACE FUNCTION public.list_directory()
 RETURNS TABLE(id uuid, full_name text, department text, profile_image text, status user_status, last_seen_at timestamp with time zone, is_online boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, full_name, department, profile_image, status, last_seen_at, is_online
  FROM public.profiles
  WHERE status = 'approved'
    AND auth.uid() IS NOT NULL
    AND private.is_approved(auth.uid());
$function$;
