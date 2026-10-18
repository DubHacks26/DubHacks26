set search_path = public, extensions;

create table if not exists public.retained_product_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  asin text not null references public.catalog_products(asin) on delete cascade,
  dwell_ms integer not null check (dwell_ms between 5001 and 3600000),
  created_at timestamptz not null default now(),
  primary key (user_id, asin)
);

create table if not exists public.positive_search_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  query_key text not null check (query_key ~ '^[0-9a-f]{64}$'),
  asin text not null references public.catalog_products(asin) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, query_key)
);

alter table public.retained_product_interactions enable row level security;
alter table public.positive_search_interactions enable row level security;
revoke all on public.retained_product_interactions,
  public.positive_search_interactions from public, anon, authenticated;
grant select, insert, update, delete on public.retained_product_interactions,
  public.positive_search_interactions to service_role;

update public.recommendation_negative_settings
set quick_skip_learning_rate = 0.05,
    quick_skip_signal_strength = 0.20
where singleton
  and quick_skip_learning_rate = 0.20
  and quick_skip_signal_strength = 0.75;

create or replace function public.search_catalog_products_by_title(
  p_query vector(384), p_limit integer default 20
) returns table (
  asin text, title text, brand text, summary text, image_url text,
  product_url text, price_cents integer, rating numeric, review_count integer,
  categories text[], hashtags text[], main_category text, subcategory text,
  similarity double precision
) language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if p_query is null or vector_norm(p_query) < 0.99 or vector_norm(p_query) > 1.01
     or p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Invalid semantic search request';
  end if;
  return query
    select p.asin, p.title, p.brand, p.summary, p.image_url, p.product_url,
      p.price_cents, p.rating, p.review_count, p.categories, p.hashtags,
      p.main_category, p.subcategory,
      (1 - (p.title_embedding <=> p_query))::double precision
    from public.catalog_products p
    where p.title_embedding is not null and p.embedding is not null
    order by p.title_embedding <=> p_query, p.asin
    limit p_limit;
end;
$$;

create or replace function public.record_retained_product_interaction(
  p_user_id uuid, p_asin text, p_dwell_ms integer
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  product_vector vector(384);
  chosen_slot smallint;
  chosen_similarity double precision;
  interest_count integer;
  previous_vector vector(384);
  previous_values real[];
  product_values real[];
  blended vector(384);
  learning_rate constant double precision := 0.03;
begin
  if p_user_id is null or p_asin is null
     or p_dwell_ms is null or p_dwell_ms not between 5001 and 3600000 then
    raise exception 'Invalid retained product interaction';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select p.embedding into product_vector from public.catalog_products p
    where p.asin = p_asin for share;
  if product_vector is null then return false; end if;

  insert into public.retained_product_interactions(user_id, asin, dwell_ms)
  values (p_user_id, p_asin, p_dwell_ms) on conflict (user_id, asin) do nothing;
  if not found then return false; end if;

  select count(*) into interest_count from public.user_interest_embeddings i
    where i.user_id = p_user_id;
  select i.slot_index, 1 - (i.embedding <=> product_vector)
    into chosen_slot, chosen_similarity
    from public.user_interest_embeddings i where i.user_id = p_user_id
    order by i.embedding <=> product_vector, i.slot_index limit 1;

  if interest_count = 0 or (chosen_similarity < 0.65 and interest_count < 5) then
    select s.slot_index into chosen_slot from generate_series(0, 4) as s(slot_index)
      where not exists (
        select 1 from public.user_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = s.slot_index
      ) order by s.slot_index limit 1;
    insert into public.user_interest_embeddings(user_id, slot_index, embedding)
      values (p_user_id, chosen_slot, product_vector);
  else
    select i.embedding into previous_vector from public.user_interest_embeddings i
      where i.user_id = p_user_id and i.slot_index = chosen_slot for update;
    previous_values := previous_vector::real[];
    product_values := product_vector::real[];
    select array_agg(((1 - learning_rate) * previous_values[n]
                      + learning_rate * product_values[n])::real order by n)::vector(384)
      into blended from generate_series(1, 384) as n;
    update public.user_interest_embeddings i
      set embedding = l2_normalize(blended)
      where i.user_id = p_user_id and i.slot_index = chosen_slot;
  end if;
  return true;
end;
$$;

create or replace function public.record_search_product_interaction(
  p_user_id uuid, p_asin text, p_query_key text
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  product_vector vector(384);
  chosen_slot smallint;
  chosen_similarity double precision;
  interest_count integer;
  previous_vector vector(384);
  previous_values real[];
  product_values real[];
  blended vector(384);
  learning_rate constant double precision := 0.03;
begin
  if p_user_id is null or p_asin is null
     or p_query_key is null or p_query_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid search preference';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select p.embedding into product_vector from public.catalog_products p
    where p.asin = p_asin for share;
  if product_vector is null then return false; end if;

  insert into public.positive_search_interactions(user_id, query_key, asin)
  values (p_user_id, p_query_key, p_asin) on conflict (user_id, query_key) do nothing;
  if not found then return false; end if;

  select count(*) into interest_count from public.user_interest_embeddings i
    where i.user_id = p_user_id;
  select i.slot_index, 1 - (i.embedding <=> product_vector)
    into chosen_slot, chosen_similarity
    from public.user_interest_embeddings i where i.user_id = p_user_id
    order by i.embedding <=> product_vector, i.slot_index limit 1;

  if interest_count = 0 or (chosen_similarity < 0.65 and interest_count < 5) then
    select s.slot_index into chosen_slot from generate_series(0, 4) as s(slot_index)
      where not exists (
        select 1 from public.user_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = s.slot_index
      ) order by s.slot_index limit 1;
    insert into public.user_interest_embeddings(user_id, slot_index, embedding)
      values (p_user_id, chosen_slot, product_vector);
  else
    select i.embedding into previous_vector from public.user_interest_embeddings i
      where i.user_id = p_user_id and i.slot_index = chosen_slot for update;
    previous_values := previous_vector::real[];
    product_values := product_vector::real[];
    select array_agg(((1 - learning_rate) * previous_values[n]
                      + learning_rate * product_values[n])::real order by n)::vector(384)
      into blended from generate_series(1, 384) as n;
    update public.user_interest_embeddings i
      set embedding = l2_normalize(blended)
      where i.user_id = p_user_id and i.slot_index = chosen_slot;
  end if;
  return true;
end;
$$;

revoke all on function public.search_catalog_products_by_title(vector, integer)
  from public, anon, authenticated;
revoke all on function public.record_retained_product_interaction(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.record_search_product_interaction(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.search_catalog_products_by_title(vector, integer)
  to service_role;
grant execute on function public.record_retained_product_interaction(uuid, text, integer)
  to service_role;
grant execute on function public.record_search_product_interaction(uuid, text, text)
  to service_role;
