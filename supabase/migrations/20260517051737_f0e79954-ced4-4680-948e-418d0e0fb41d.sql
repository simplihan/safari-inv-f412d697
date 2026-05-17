
create table if not exists public.dept_chat_settings (
  department text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.dept_chat_settings enable row level security;

drop policy if exists "view chat settings" on public.dept_chat_settings;
create policy "view chat settings" on public.dept_chat_settings
  for select to authenticated using (true);

drop policy if exists "admin manage chat settings" on public.dept_chat_settings;
create policy "admin manage chat settings" on public.dept_chat_settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "manager toggle own dept chat" on public.dept_chat_settings;
create policy "manager toggle own dept chat" on public.dept_chat_settings
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'manager'::app_role)
    and department = (select p.department from public.profiles p where p.id = auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'manager'::app_role)
    and department = (select p.department from public.profiles p where p.id = auth.uid())
  );

insert into public.dept_chat_settings (department, enabled) values
  ('Inventory', true), ('Purchase', true), ('Admin', true), ('Customer Service', true)
on conflict (department) do nothing;

-- Enforce "chat off" at the database layer
drop policy if exists "send as self (same dept)" on public.messages;
drop policy if exists "send as self (same dept, chat on)" on public.messages;
create policy "send as self (same dept, chat on)" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin_or_manager(auth.uid())
      or public.same_department(auth.uid(), recipient_id)
    )
    and (
      public.is_admin_or_manager(auth.uid())
      or exists (
        select 1
        from public.dept_chat_settings dcs
        join public.profiles p on p.id = auth.uid()
        where dcs.department = p.department and dcs.enabled = true
      )
    )
  );
