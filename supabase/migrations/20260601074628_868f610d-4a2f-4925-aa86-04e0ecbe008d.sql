
-- Add only missing tables to realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dept_chat_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.departments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
