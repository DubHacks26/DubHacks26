-- Run in Supabase SQL Editor. Email mappings are accessible only to the server.
create table if not exists public.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  email text not null
);
alter table public.account_usernames enable row level security;
revoke all on public.account_usernames from anon, authenticated;
grant select on public.account_usernames to service_role;
create or replace function public.sync_account_username()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'username' is not null then
    insert into public.account_usernames(user_id, username, email)
    values (new.id, lower(new.raw_user_meta_data->>'username'), new.email)
    on conflict (user_id) do update set email = excluded.email;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_account_username() from public;
drop trigger if exists sync_account_username on auth.users;
create trigger sync_account_username after insert or update of email on auth.users
for each row execute procedure public.sync_account_username();
