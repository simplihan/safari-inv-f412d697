
-- helper: same department
create or replace function public.same_department(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pa
    join public.profiles pb on pb.id = _b
    where pa.id = _a
      and pa.department is not null
      and pa.department = pb.department
  )
$$;

-- broaden visibility on profiles to same department
drop policy if exists "view own profile" on public.profiles;
create policy "view profile (self / dept / mgr)" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin_or_manager(auth.uid())
  or public.same_department(auth.uid(), id)
);

-- broaden visibility on break_logs to same department
drop policy if exists "view own breaks" on public.break_logs;
create policy "view breaks (self / dept / mgr)" on public.break_logs
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_or_manager(auth.uid())
  or public.same_department(auth.uid(), user_id)
);

-- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  recipient_id uuid not null,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index idx_messages_pair on public.messages(sender_id, recipient_id, created_at desc);
create index idx_messages_recipient on public.messages(recipient_id, created_at desc);
create index idx_messages_created on public.messages(created_at);

alter table public.messages enable row level security;

create policy "view own conversations" on public.messages
for select to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "send as self" on public.messages
for insert to authenticated
with check (sender_id = auth.uid());

create policy "mark received as read" on public.messages
for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

create policy "delete own sent" on public.messages
for delete to authenticated
using (sender_id = auth.uid());

-- realtime
alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;

-- 10-day auto-cleanup
create or replace function public.cleanup_old_messages()
returns void language sql security definer set search_path = public as $$
  delete from public.messages where created_at < now() - interval '10 days';
$$;

create extension if not exists pg_cron;
select cron.schedule('cleanup-old-messages-daily','0 3 * * *', $$select public.cleanup_old_messages();$$);

-- tighten executes on security definer helpers (linter warnings)
revoke execute on function public.same_department(uuid, uuid) from anon;
revoke execute on function public.cleanup_old_messages() from anon, authenticated;
