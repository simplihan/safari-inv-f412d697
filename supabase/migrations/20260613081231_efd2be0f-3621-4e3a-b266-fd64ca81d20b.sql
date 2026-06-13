
-- 1. user_departments table for multi-department assignments
CREATE TABLE IF NOT EXISTS public.user_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, department)
);

GRANT SELECT ON public.user_departments TO authenticated;
GRANT ALL ON public.user_departments TO service_role;

ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

-- Approved users can read assignments (used for chat/visibility scoping)
DROP POLICY IF EXISTS "approved_can_read_user_departments" ON public.user_departments;
CREATE POLICY "approved_can_read_user_departments"
  ON public.user_departments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND private.is_approved(auth.uid()));

-- Backfill from profiles.department
INSERT INTO public.user_departments (user_id, department)
SELECT id, department FROM public.profiles
WHERE department IS NOT NULL AND department <> ''
ON CONFLICT (user_id, department) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_departments_user ON public.user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON public.user_departments(department);

-- 2. Update same_department to honor multi-dept assignments (union of primary + user_departments)
CREATE OR REPLACE FUNCTION private.same_department(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH a_depts AS (
    SELECT department FROM public.profiles WHERE id = _a AND department IS NOT NULL
    UNION
    SELECT department FROM public.user_departments WHERE user_id = _a
  ),
  b_depts AS (
    SELECT department FROM public.profiles WHERE id = _b AND department IS NOT NULL
    UNION
    SELECT department FROM public.user_departments WHERE user_id = _b
  )
  SELECT EXISTS (SELECT 1 FROM a_depts a JOIN b_depts b ON a.department = b.department);
$function$;

-- 3. Cascade department renames to user_departments too
CREATE OR REPLACE FUNCTION public.cascade_department_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.profiles SET department = NEW.name WHERE department = OLD.name;
    UPDATE public.dept_chat_settings SET department = NEW.name WHERE department = OLD.name;
    UPDATE public.user_departments SET department = NEW.name WHERE department = OLD.name;
  END IF;
  RETURN NEW;
END;
$function$;
