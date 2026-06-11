-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'info' CHECK (priority IN ('info','warning','urgent')),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global','department')),
  department text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read by: admins (all), managers (their dept or global), others (global or their dept)
CREATE POLICY "notifications_select"
ON public.notifications FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR scope = 'global'
  OR (scope = 'department' AND department = (SELECT department FROM public.profiles WHERE id = auth.uid()))
);

-- Insert: admins anywhere; managers only for their department or global to their department
CREATE POLICY "notifications_insert_admin"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR (
    private.has_role(auth.uid(), 'manager')
    AND (
      (scope = 'global')
      OR (scope = 'department' AND department = (SELECT department FROM public.profiles WHERE id = auth.uid()))
    )
  )
);

-- Update / Delete: admins anywhere; managers only their own notifications
CREATE POLICY "notifications_update"
ON public.notifications FOR UPDATE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (private.has_role(auth.uid(), 'manager') AND created_by = auth.uid())
)
WITH CHECK (
  private.has_role(auth.uid(), 'admin')
  OR (private.has_role(auth.uid(), 'manager') AND created_by = auth.uid())
);

CREATE POLICY "notifications_delete"
ON public.notifications FOR DELETE
TO authenticated
USING (
  private.has_role(auth.uid(), 'admin')
  OR (private.has_role(auth.uid(), 'manager') AND created_by = auth.uid())
);

CREATE TRIGGER notifications_touch_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Reads table
CREATE TABLE public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_reads_select_own"
ON public.notification_reads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notif_reads_insert_own"
ON public.notification_reads FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_reads_delete_own"
ON public.notification_reads FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;