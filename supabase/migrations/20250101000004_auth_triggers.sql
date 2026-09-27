-- Auth triggers.
--
-- Split out from the table definitions so `handle_new_user` is only created
-- once every table it writes to exists.

-- Create the profile and settings rows for a new signup. Runs as the auth
-- service, so it needs SECURITY DEFINER to write rows the caller cannot insert
-- directly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for any auth user that predates the trigger above. Idempotent.
insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.settings (user_id)
select u.id
from auth.users u
where not exists (select 1 from public.settings s where s.user_id = u.id);
