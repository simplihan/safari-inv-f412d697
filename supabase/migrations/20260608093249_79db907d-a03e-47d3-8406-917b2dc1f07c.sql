
-- Allow manager/supervisor to update status of profiles in their own department
CREATE POLICY "managers update same-dept status"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  private.is_admin_or_manager(auth.uid())
  AND private.same_department(auth.uid(), id)
)
WITH CHECK (
  private.is_admin_or_manager(auth.uid())
  AND private.same_department(auth.uid(), id)
);

-- Relax the guard trigger so managers/supervisors may change status (but nothing else privileged)
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  is_admin boolean := auth.uid() IS NOT NULL AND private.has_role(auth.uid(), 'admin');
  is_mgr boolean := auth.uid() IS NOT NULL AND (
    private.has_role(auth.uid(), 'manager') OR private.has_role(auth.uid(), 'supervisor')
  );
BEGIN
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Managers/supervisors may change status only for users in their department
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (is_mgr AND private.same_department(auth.uid(), OLD.id)) THEN
      RAISE EXCEPTION 'Not allowed to change status' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Not allowed to change email' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.sgc_id IS DISTINCT FROM OLD.sgc_id THEN
    RAISE EXCEPTION 'Not allowed to change SGC ID' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.department IS DISTINCT FROM OLD.department THEN
    RAISE EXCEPTION 'Not allowed to change department' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Not allowed to change id' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;
