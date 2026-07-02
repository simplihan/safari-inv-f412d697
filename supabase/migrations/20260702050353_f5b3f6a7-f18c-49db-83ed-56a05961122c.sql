
DO $$ BEGIN
  CREATE TYPE public.permission_level AS ENUM ('view','edit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS access_level public.permission_level NOT NULL DEFAULT 'view';

CREATE OR REPLACE FUNCTION public.has_edit_permission(_user_id uuid, _perm app_permission)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission = _perm AND access_level = 'edit'
  );
$fn$;
