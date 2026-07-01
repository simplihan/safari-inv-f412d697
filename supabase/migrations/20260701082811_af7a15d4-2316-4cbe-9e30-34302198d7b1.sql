
-- 1) Enum for permission keys
DO $$ BEGIN
  CREATE TYPE public.app_permission AS ENUM (
    'view_reports',
    'view_monthly',
    'view_monitoring',
    'view_pending',
    'manage_staff',
    'view_audit',
    'send_notifications',
    'manage_chat_settings',
    'cross_department'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_scope AS ENUM ('department', 'global');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Grants table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission public.app_permission NOT NULL,
  scope public.permission_scope NOT NULL DEFAULT 'department',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins manage everything
CREATE POLICY "Admins manage user_permissions"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- Users can read their own permissions
CREATE POLICY "Users read their own permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Managers/supervisors can read grants of users in their department (for visibility)
CREATE POLICY "Managers read dept permissions"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (
    (private.has_role(auth.uid(), 'manager'::app_role)
      OR private.has_role(auth.uid(), 'supervisor'::app_role))
    AND private.same_department(auth.uid(), user_id)
  );

CREATE TRIGGER touch_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Helper functions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _perm public.app_permission)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission = _perm
  );
$$;

CREATE OR REPLACE FUNCTION public.has_global_permission(_user_id UUID, _perm public.app_permission)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissions
    WHERE user_id = _user_id AND permission = _perm AND scope = 'global'
  );
$$;

-- 4) Update visible-users to honor cross_department global grant
CREATE OR REPLACE FUNCTION public.list_visible_user_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  is_admin boolean;
  is_manager boolean;
  is_supervisor boolean;
  cross_dept boolean;
  allowed app_role[];
BEGIN
  IF me IS NULL THEN RETURN; END IF;

  is_admin := private.has_role(me, 'admin'::app_role);
  is_manager := private.has_role(me, 'manager'::app_role);
  is_supervisor := private.has_role(me, 'supervisor'::app_role);
  cross_dept := public.has_global_permission(me, 'cross_department'::app_permission);

  IF is_admin THEN
    allowed := ARRAY['admin','manager','supervisor','staff']::app_role[];
  ELSIF is_manager THEN
    allowed := ARRAY['manager','supervisor','staff']::app_role[];
  ELSIF is_supervisor THEN
    allowed := ARRAY['supervisor','staff']::app_role[];
  ELSE
    allowed := ARRAY['staff']::app_role[];
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE
    p.id = me
    OR (
      (is_admin OR NOT EXISTS (
        SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = p.id AND ur2.role = 'admin'
      ))
      AND (is_admin OR cross_dept OR private.same_department(me, p.id))
      AND (
        COALESCE(ur.role, 'staff'::app_role) = ANY(allowed)
      )
    );
END;
$function$;
