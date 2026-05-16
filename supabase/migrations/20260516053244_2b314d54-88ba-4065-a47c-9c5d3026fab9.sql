-- Tighten messages: same-department only (admins/managers exempt)
DROP POLICY IF EXISTS "send as self" ON public.messages;
CREATE POLICY "send as self (same dept)" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    is_admin_or_manager(auth.uid())
    OR same_department(auth.uid(), recipient_id)
  )
);

DROP POLICY IF EXISTS "view own conversations" ON public.messages;
CREATE POLICY "view own conversations" ON public.messages
FOR SELECT TO authenticated
USING (
  sender_id = auth.uid() OR recipient_id = auth.uid()
);