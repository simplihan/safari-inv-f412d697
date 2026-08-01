-- Add custom monthly report subject per department
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS monthly_report_subject text;

-- Allow authenticated users to view the subject column (admins manage it)
GRANT SELECT (id, name, monthly_report_email, monthly_report_subject) ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
