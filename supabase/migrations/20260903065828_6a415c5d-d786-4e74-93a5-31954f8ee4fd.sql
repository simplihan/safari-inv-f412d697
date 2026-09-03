CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  notes text,
  remind_at timestamptz NOT NULL,
  snoozed_until timestamptz,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reminders"
ON public.reminders FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX reminders_user_due_idx ON public.reminders (user_id, done, remind_at);

CREATE TRIGGER reminders_touch_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();