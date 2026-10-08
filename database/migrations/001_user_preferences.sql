begin;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_preferences_object check (jsonb_typeof(preferences) = 'object'),
  constraint user_preferences_size check (octet_length(preferences::text) <= 16384)
);

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select, insert, update on public.user_preferences to authenticated;

drop policy if exists "Read own preferences" on public.user_preferences;
create policy "Read own preferences" on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Insert own preferences" on public.user_preferences;
create policy "Insert own preferences" on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own preferences" on public.user_preferences;
create policy "Update own preferences" on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.stamp_user_preferences()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.stamp_user_preferences() from public;
drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences
  for each row execute function public.stamp_user_preferences();

commit;
