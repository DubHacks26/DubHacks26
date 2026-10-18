create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to service_role;
set search_path = public, extensions;

alter table public.catalog_products add column if not exists embedding vector(384);
alter table public.catalog_products add constraint catalog_products_embedding_normalized
  check (embedding is null or vector_norm(embedding) between 0.99 and 1.01);

-- A hashtag change invalidates its old vector. Workers fill null vectors later.
create or replace function public.invalidate_catalog_embedding()
returns trigger language plpgsql set search_path = pg_catalog, public, extensions as $$
begin
  if new.hashtags is distinct from old.hashtags then
    new.embedding = null;
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_catalog_embedding() from public;
drop trigger if exists invalidate_catalog_embedding on public.catalog_products;
create trigger invalidate_catalog_embedding before update of hashtags on public.catalog_products
for each row execute function public.invalidate_catalog_embedding();

create table if not exists public.user_interest_embeddings (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_index smallint not null check (slot_index between 0 and 4),
  embedding vector(384) not null,
  constraint user_interest_embeddings_normalized
    check (vector_norm(embedding) between 0.99 and 1.01),
  primary key (user_id, slot_index)
);
alter table public.user_interest_embeddings enable row level security;
revoke all on public.user_interest_embeddings from anon, authenticated;
grant select, insert, update, delete on public.user_interest_embeddings to service_role;

-- One positive reinforcement per product, regardless of retries or action type.
create table if not exists public.positive_product_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  asin text not null references public.catalog_products(asin) on delete cascade,
  action text not null check (action in ('like', 'save')),
  created_at timestamptz not null default now(),
  primary key (user_id, asin)
);
alter table public.positive_product_interactions enable row level security;
revoke all on public.positive_product_interactions from anon, authenticated;
grant select, insert, update, delete on public.positive_product_interactions to service_role;
create index if not exists positive_product_interactions_asin_idx
  on public.positive_product_interactions (asin);

-- Compare the source hashtags inside the same UPDATE, so a delayed worker
-- cannot save an embedding for stale hashtags.
create or replace function public.save_catalog_embedding(
  p_asin text, p_hashtags text[], p_embedding vector(384)
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
begin
  if p_embedding is null or vector_norm(p_embedding) < 0.99
     or vector_norm(p_embedding) > 1.01 then
    raise exception 'Expected a normalized product embedding';
  end if;
  update public.catalog_products p set embedding = p_embedding
  where p.asin = p_asin and p.hashtags = p_hashtags and p.embedding is null;
  return found;
end;
$$;
revoke all on function public.save_catalog_embedding(text, text[], vector) from public;
grant execute on function public.save_catalog_embedding(text, text[], vector) to service_role;

-- The advisory lock serializes all interactions for one user, including the
-- first interaction when there is no interest row to lock yet.
create or replace function public.record_positive_product_interaction(
  p_user_id uuid, p_asin text, p_action text, p_threshold double precision,
  p_learning_rate double precision
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
begin
  if p_user_id is null or p_action is null or p_action not in ('like', 'save')
     or p_threshold is null or p_threshold < -1 or p_threshold > 1
     or p_learning_rate is null or p_learning_rate <= 0 or p_learning_rate > 1 then
    raise exception 'Invalid positive interaction';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select p.embedding into product_vector from public.catalog_products p
  where p.asin = p_asin for share;
  if product_vector is null then return false; end if;

  insert into public.positive_product_interactions(user_id, asin, action)
  values (p_user_id, p_asin, p_action) on conflict (user_id, asin) do nothing;
  if not found then return false; end if;

  select count(*) into interest_count from public.user_interest_embeddings i
  where i.user_id = p_user_id;
  select i.slot_index, 1 - (i.embedding <=> product_vector)
    into chosen_slot, chosen_similarity
    from public.user_interest_embeddings i where i.user_id = p_user_id
    order by i.embedding <=> product_vector, i.slot_index limit 1;

  if interest_count = 0 or (chosen_similarity < p_threshold and interest_count < 5) then
    select s.slot_index into chosen_slot from generate_series(0, 4) as s(slot_index)
    where not exists (select 1 from public.user_interest_embeddings i
                      where i.user_id = p_user_id and i.slot_index = s.slot_index)
    order by s.slot_index limit 1;
    insert into public.user_interest_embeddings(user_id, slot_index, embedding)
    values (p_user_id, chosen_slot, product_vector);
  else
    select i.embedding into previous_vector from public.user_interest_embeddings i
    where i.user_id = p_user_id and i.slot_index = chosen_slot;
    previous_values := previous_vector::real[];
    product_values := product_vector::real[];
    select array_agg(((1 - p_learning_rate) * previous_values[n]
                      + p_learning_rate * product_values[n])::real order by n)::vector(384)
      into blended from generate_series(1, 384) as n;
    update public.user_interest_embeddings i
      set embedding = l2_normalize(blended)
      where i.user_id = p_user_id and i.slot_index = chosen_slot;
  end if;
  return true;
end;
$$;
revoke all on function public.record_positive_product_interaction(uuid, text, text, double precision, double precision) from public;
grant execute on function public.record_positive_product_interaction(uuid, text, text, double precision, double precision) to service_role;

create or replace function public.recommend_catalog_products(
  p_user_id uuid, p_limit integer default 20, p_exclude_asins text[] default '{}'
) returns table (
  asin text, title text, brand text, summary text, image_url text,
  product_url text, price_cents integer, rating numeric, review_count integer,
  categories text[], hashtags text[], similarity double precision
) language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
begin
  if p_user_id is null or p_limit is null or p_limit < 1 or p_limit > 100
     or p_exclude_asins is null or cardinality(p_exclude_asins) > 500 then
    raise exception 'Invalid recommendation request';
  end if;
  if not exists (select 1 from public.user_interest_embeddings i where i.user_id = p_user_id)
     or not exists (select 1 from public.catalog_products p where p.embedding is not null) then
    return query select p.asin, p.title, p.brand, p.summary, p.image_url,
      p.product_url, p.price_cents, p.rating, p.review_count,
      p.categories, p.hashtags, null::double precision
      from public.catalog_products p
      where not (p.asin = any(p_exclude_asins))
      order by p.last_seen_at desc, p.asin limit p_limit;
  else
    return query with per_interest as (
      select i.slot_index, c.*, row_number() over
        (partition by i.slot_index order by c.distance, c.asin) as position
      from public.user_interest_embeddings i
      cross join lateral (
        select p.asin, p.title, p.brand, p.summary, p.image_url,
          p.product_url, p.price_cents, p.rating, p.review_count,
          p.categories, p.hashtags, p.embedding <=> i.embedding as distance
        from public.catalog_products p
        where p.embedding is not null and not (p.asin = any(p_exclude_asins))
        order by p.embedding <=> i.embedding, p.asin
        limit least(p_limit * 3, 300)
      ) c where i.user_id = p_user_id
    ), deduplicated as (
      select q.*, row_number() over
        (partition by q.asin order by q.position, q.distance, q.slot_index) as duplicate_rank
      from per_interest q
    )
    select d.asin, d.title, d.brand, d.summary, d.image_url,
      d.product_url, d.price_cents, d.rating, d.review_count,
      d.categories, d.hashtags, 1 - d.distance
      from deduplicated d where d.duplicate_rank = 1
      order by d.position, d.slot_index, d.distance, d.asin limit p_limit;
  end if;
end;
$$;
revoke all on function public.recommend_catalog_products(uuid, integer, text[]) from public;
grant execute on function public.recommend_catalog_products(uuid, integer, text[]) to service_role;
