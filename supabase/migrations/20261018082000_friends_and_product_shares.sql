create table if not exists public.friend_connections (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by = user_low or requested_by = user_high)
);

create table if not exists public.shared_products (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  asin text not null references public.catalog_products(asin) on delete cascade,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists friend_connections_low_status_idx
  on public.friend_connections(user_low, status);
create index if not exists friend_connections_high_status_idx
  on public.friend_connections(user_high, status);
create index if not exists shared_products_recipient_created_idx
  on public.shared_products(recipient_id, created_at desc);

alter table public.friend_connections enable row level security;
alter table public.shared_products enable row level security;
revoke all on public.friend_connections, public.shared_products from public, anon, authenticated;
grant select, insert, update, delete on public.friend_connections, public.shared_products to service_role;

create or replace function public.search_account_usernames(
  p_prefix text, p_user_id uuid, p_limit integer default 20
) returns table(user_id uuid, username text, relationship text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_prefix is null or char_length(btrim(p_prefix)) < 2
     or char_length(btrim(p_prefix)) > 24
     or p_prefix !~ '^[a-zA-Z0-9_]+$'
     or p_user_id is null
     or p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid friend search request';
  end if;

  return query
    select accounts.user_id, accounts.username,
      case
        when connections.status = 'accepted' then 'friends'
        when connections.requested_by = p_user_id then 'outgoing'
        when connections.requested_by is not null then 'incoming'
        else 'none'
      end::text as relationship
    from public.account_usernames accounts
    left join public.friend_connections connections
      on connections.user_low = least(accounts.user_id, p_user_id)
      and connections.user_high = greatest(accounts.user_id, p_user_id)
    where accounts.user_id <> p_user_id
      and left(accounts.username, char_length(lower(btrim(p_prefix)))) = lower(btrim(p_prefix))
    order by accounts.username
    limit p_limit;
end;
$$;

create or replace function public.get_friend_data(p_user_id uuid)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', account.user_id,
        'username', account.username
      ) order by account.username)
      from public.friend_connections connection
      join public.account_usernames account
        on account.user_id = case
          when connection.user_low = p_user_id then connection.user_high
          else connection.user_low
        end
      where connection.status = 'accepted'
        and (connection.user_low = p_user_id or connection.user_high = p_user_id)
    ), '[]'::jsonb),
    'incomingRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', account.user_id,
        'username', account.username,
        'requestedAt', connection.created_at
      ) order by connection.created_at desc)
      from public.friend_connections connection
      join public.account_usernames account on account.user_id = connection.requested_by
      where connection.status = 'pending'
        and connection.requested_by <> p_user_id
        and (connection.user_low = p_user_id or connection.user_high = p_user_id)
    ), '[]'::jsonb),
    'outgoingRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', account.user_id,
        'username', account.username,
        'requestedAt', connection.created_at
      ) order by connection.created_at desc)
      from public.friend_connections connection
      join public.account_usernames account
        on account.user_id = case
          when connection.user_low = p_user_id then connection.user_high
          else connection.user_low
        end
      where connection.status = 'pending'
        and connection.requested_by = p_user_id
        and (connection.user_low = p_user_id or connection.user_high = p_user_id)
    ), '[]'::jsonb),
    'shares', coalesce((
      select jsonb_agg(shares.share_data order by shares.created_at desc)
      from (
        select shared.created_at,
          jsonb_build_object(
            'id', shared.id,
            'asin', product.asin,
            'title', product.title,
            'brand', product.brand,
            'imageUrl', product.image_url,
            'productUrl', product.product_url,
            'priceCents', product.price_cents,
            'senderUsername', sender.username,
            'createdAt', shared.created_at
          ) as share_data
        from public.shared_products shared
        join public.account_usernames sender on sender.user_id = shared.sender_id
        join public.catalog_products product on product.asin = shared.asin
        where shared.recipient_id = p_user_id
          and exists (
            select 1 from public.friend_connections connection
            where connection.status = 'accepted'
              and connection.user_low = least(shared.sender_id, shared.recipient_id)
              and connection.user_high = greatest(shared.sender_id, shared.recipient_id)
          )
        order by shared.created_at desc
        limit 50
      ) shares
    ), '[]'::jsonb)
  );
$$;

create or replace function public.create_friend_request(
  p_sender_id uuid, p_recipient_id uuid
) returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  low_id uuid;
  high_id uuid;
  current_status text;
  current_requester uuid;
begin
  if p_sender_id is null or p_recipient_id is null or p_sender_id = p_recipient_id then
    raise exception 'Invalid friend request';
  end if;
  if not exists (select 1 from public.account_usernames where user_id = p_recipient_id) then
    return 'not_found';
  end if;

  low_id := least(p_sender_id, p_recipient_id);
  high_id := greatest(p_sender_id, p_recipient_id);
  insert into public.friend_connections(user_low, user_high, requested_by)
  values (low_id, high_id, p_sender_id)
  on conflict (user_low, user_high) do nothing;

  select connection.status, connection.requested_by
    into current_status, current_requester
    from public.friend_connections connection
    where connection.user_low = low_id and connection.user_high = high_id;
  if current_status = 'accepted' then return 'friends'; end if;
  if current_requester = p_sender_id then return 'outgoing'; end if;
  return 'incoming';
end;
$$;

create or replace function public.respond_friend_request(
  p_user_id uuid, p_friend_id uuid, p_accept boolean
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  low_id uuid := least(p_user_id, p_friend_id);
  high_id uuid := greatest(p_user_id, p_friend_id);
begin
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id
     or p_accept is null then
    raise exception 'Invalid friend response';
  end if;

  if p_accept then
    update public.friend_connections
      set status = 'accepted', updated_at = now()
      where user_low = low_id and user_high = high_id
        and status = 'pending' and requested_by = p_friend_id;
  else
    delete from public.friend_connections
      where user_low = low_id and user_high = high_id
        and status = 'pending' and requested_by = p_friend_id;
  end if;
  return found;
end;
$$;

create or replace function public.remove_friendship(
  p_user_id uuid, p_friend_id uuid
) returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  low_id uuid := least(p_user_id, p_friend_id);
  high_id uuid := greatest(p_user_id, p_friend_id);
begin
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id then
    raise exception 'Invalid friendship';
  end if;
  delete from public.friend_connections
    where user_low = low_id and user_high = high_id and status = 'accepted';
  return found;
end;
$$;

create or replace function public.share_product_with_friend(
  p_sender_id uuid, p_recipient_id uuid, p_asin text
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  share_id uuid;
begin
  if p_sender_id is null or p_recipient_id is null or p_sender_id = p_recipient_id
     or p_asin is null or p_asin !~ '^[A-Z0-9]{10}$' then
    raise exception 'Invalid product share';
  end if;
  if not exists (
    select 1 from public.friend_connections connection
    where connection.status = 'accepted'
      and connection.user_low = least(p_sender_id, p_recipient_id)
      and connection.user_high = greatest(p_sender_id, p_recipient_id)
  ) then
    raise exception 'Products can only be shared with an accepted friend';
  end if;
  if not exists (select 1 from public.catalog_products where asin = p_asin) then
    raise exception 'Product not found';
  end if;

  insert into public.shared_products(sender_id, recipient_id, asin)
    values (p_sender_id, p_recipient_id, p_asin)
    returning id into share_id;
  return share_id;
end;
$$;

revoke all on function public.search_account_usernames(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_friend_data(uuid)
  from public, anon, authenticated;
revoke all on function public.create_friend_request(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.respond_friend_request(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.remove_friendship(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.share_product_with_friend(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.search_account_usernames(text, uuid, integer) to service_role;
grant execute on function public.get_friend_data(uuid) to service_role;
grant execute on function public.create_friend_request(uuid, uuid) to service_role;
grant execute on function public.respond_friend_request(uuid, uuid, boolean) to service_role;
grant execute on function public.remove_friendship(uuid, uuid) to service_role;
grant execute on function public.share_product_with_friend(uuid, uuid, text) to service_role;
