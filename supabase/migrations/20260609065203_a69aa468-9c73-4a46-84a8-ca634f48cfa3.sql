-- Tighten message recipient updates to only allow toggling delivered_at / read_at.
DROP POLICY IF EXISTS "mark received as delivered" ON public.messages;
DROP POLICY IF EXISTS "mark received as read" ON public.messages;

CREATE OR REPLACE FUNCTION public.guard_message_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- Only restrict the recipient path. Admins/managers and other future paths are unaffected.
  IF auth.uid() IS NULL OR auth.uid() <> OLD.recipient_id THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Recipients may only update delivered_at or read_at'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_recipient_update ON public.messages;
CREATE TRIGGER guard_message_recipient_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.guard_message_recipient_update();

CREATE POLICY "mark received as delivered"
ON public.messages
FOR UPDATE
USING ((recipient_id = auth.uid()) AND private.is_approved(auth.uid()))
WITH CHECK (
  (recipient_id = auth.uid())
  AND private.is_approved(auth.uid())
);

CREATE POLICY "mark received as read"
ON public.messages
FOR UPDATE
USING ((recipient_id = auth.uid()) AND private.is_approved(auth.uid()))
WITH CHECK (
  (recipient_id = auth.uid())
  AND private.is_approved(auth.uid())
);