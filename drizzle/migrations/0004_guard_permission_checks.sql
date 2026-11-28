CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm app_permission)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
   AND EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _perm);
$$;
CREATE OR REPLACE FUNCTION public.has_edit_permission(_user_id uuid, _perm app_permission)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
   AND EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _perm AND access_level = 'edit');
$$;
CREATE OR REPLACE FUNCTION public.has_global_permission(_user_id uuid, _perm app_permission)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role))
   AND EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND permission = _perm AND scope = 'global');
$$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, app_permission) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_edit_permission(uuid, app_permission) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_global_permission(uuid, app_permission) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, app_permission) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_edit_permission(uuid, app_permission) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_global_permission(uuid, app_permission) TO authenticated, service_role;