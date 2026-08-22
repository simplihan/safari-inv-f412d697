-- Helper: does user hold an edit-level grant for a permission, scoped to target user?
CREATE OR REPLACE FUNCTION private.can_edit_user(_actor uuid, _target uuid, _perm app_permission)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_edit_permission(_actor, _perm)
     AND (
       public.has_global_permission(_actor, _perm)
       OR public.has_global_permission(_actor, 'cross_department')
       OR private.same_department(_actor, _target)
     );
$$;

CREATE OR REPLACE FUNCTION private.is_staff_status_editor(_actor uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.can_edit_user(_actor, _target, 'manage_staff')
      OR private.can_edit_user(_actor, _target, 'view_pending');
$$;

-- PROFILES: edit-permission holders can change status like a manager (other columns pinned)
DROP POLICY IF EXISTS "edit-permission holders update status" ON public.profiles;
CREATE POLICY "edit-permission holders update status"
ON public.profiles
FOR UPDATE
TO authenticated
USING (private.is_staff_status_editor(auth.uid(), id))
WITH CHECK (
  private.is_staff_status_editor(auth.uid(), id)
  AND email = (SELECT p.email FROM public.profiles p WHERE p.id = profiles.id)
  AND full_name = (SELECT p.full_name FROM public.profiles p WHERE p.id = profiles.id)
  AND NOT (department IS DISTINCT FROM (SELECT p.department FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (sgc_id IS DISTINCT FROM (SELECT p.sgc_id FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (mobile IS DISTINCT FROM (SELECT p.mobile FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (profile_image IS DISTINCT FROM (SELECT p.profile_image FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (notif_enabled IS DISTINCT FROM (SELECT p.notif_enabled FROM public.profiles p WHERE p.id = profiles.id))
);

-- CHAT SETTINGS: edit-permission holders manage their own department's chat
DROP POLICY IF EXISTS "edit-permission holders toggle dept chat" ON public.dept_chat_settings;
CREATE POLICY "edit-permission holders toggle dept chat"
ON public.dept_chat_settings
FOR UPDATE
TO authenticated
USING (
  public.has_edit_permission(auth.uid(), 'manage_chat_settings')
  AND (
    public.has_global_permission(auth.uid(), 'manage_chat_settings')
    OR department IN (
      SELECT p.department FROM public.profiles p WHERE p.id = auth.uid()
      UNION SELECT ud.department FROM public.user_departments ud WHERE ud.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.has_edit_permission(auth.uid(), 'manage_chat_settings')
  AND (
    public.has_global_permission(auth.uid(), 'manage_chat_settings')
    OR department IN (
      SELECT p.department FROM public.profiles p WHERE p.id = auth.uid()
      UNION SELECT ud.department FROM public.user_departments ud WHERE ud.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "edit-permission holders create dept chat row" ON public.dept_chat_settings;
CREATE POLICY "edit-permission holders create dept chat row"
ON public.dept_chat_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_edit_permission(auth.uid(), 'manage_chat_settings')
  AND (
    public.has_global_permission(auth.uid(), 'manage_chat_settings')
    OR department IN (
      SELECT p.department FROM public.profiles p WHERE p.id = auth.uid()
      UNION SELECT ud.department FROM public.user_departments ud WHERE ud.user_id = auth.uid()
    )
  )
);

-- Managers also need INSERT for the upsert path on their own department
DROP POLICY IF EXISTS "manager create own dept chat row" ON public.dept_chat_settings;
CREATE POLICY "manager create own dept chat row"
ON public.dept_chat_settings
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'manager')
  AND department IN (
    SELECT p.department FROM public.profiles p WHERE p.id = auth.uid()
    UNION SELECT ud.department FROM public.user_departments ud WHERE ud.user_id = auth.uid()
  )
);

-- NOTIFICATIONS: edit-permission holders can post and manage their own
DROP POLICY IF EXISTS "notifications_insert_perm" ON public.notifications;
CREATE POLICY "notifications_insert_perm"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_edit_permission(auth.uid(), 'send_notifications')
  AND created_by = auth.uid()
  AND (
    scope = 'global'
    OR (scope = 'department' AND (
      public.has_global_permission(auth.uid(), 'send_notifications')
      OR department IN (
        SELECT p.department FROM public.profiles p WHERE p.id = auth.uid()
        UNION SELECT ud.department FROM public.user_departments ud WHERE ud.user_id = auth.uid()
      )
    ))
  )
);

DROP POLICY IF EXISTS "notifications_update_perm" ON public.notifications;
CREATE POLICY "notifications_update_perm"
ON public.notifications
FOR UPDATE
TO authenticated
USING (public.has_edit_permission(auth.uid(), 'send_notifications') AND created_by = auth.uid())
WITH CHECK (public.has_edit_permission(auth.uid(), 'send_notifications') AND created_by = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_perm" ON public.notifications;
CREATE POLICY "notifications_delete_perm"
ON public.notifications
FOR DELETE
TO authenticated
USING (public.has_edit_permission(auth.uid(), 'send_notifications') AND created_by = auth.uid());
