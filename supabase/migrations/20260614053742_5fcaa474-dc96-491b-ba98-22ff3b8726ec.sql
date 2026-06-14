
-- Last seen tracking on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- Re-define list_directory to include last_seen_at
DROP FUNCTION IF EXISTS public.list_directory();
CREATE OR REPLACE FUNCTION public.list_directory()
RETURNS TABLE(id uuid, full_name text, department text, profile_image text, status user_status, last_seen_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, full_name, department, profile_image, status, last_seen_at
  FROM public.profiles
  WHERE status = 'approved'
    AND auth.uid() IS NOT NULL
    AND private.is_approved(auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.list_directory() TO authenticated;

-- Per-user "delete for me" hiding
CREATE TABLE IF NOT EXISTS public.message_hidden (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.message_hidden TO authenticated;
GRANT ALL ON public.message_hidden TO service_role;

ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own hidden"
ON public.message_hidden FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "hide own visible messages"
ON public.message_hidden FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid())
  )
);

CREATE POLICY "unhide own"
ON public.message_hidden FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_hidden;
