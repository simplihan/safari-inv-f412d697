
alter table public.messages add column if not exists delivered_at timestamptz;

drop policy if exists "mark received as delivered" on public.messages;
create policy "mark received as delivered" on public.messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
