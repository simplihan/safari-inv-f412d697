DROP POLICY IF EXISTS "send as self (chat on)" ON public.messages;

CREATE POLICY "send as self (same dept, chat on)" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND private.is_approved(auth.uid())
  AND (private.is_admin_or_manager(auth.uid()) OR private.same_department(auth.uid(), recipient_id))
  AND (
    private.is_admin_or_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dept_chat_settings dcs
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE dcs.department = p.department AND dcs.enabled = true
    )
  )
);