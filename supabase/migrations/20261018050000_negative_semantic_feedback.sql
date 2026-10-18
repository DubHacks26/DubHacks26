set search_path = public, extensions;

-- Keep the elapsed time that produced a skip. It remains optional for older
-- clients and migrations, but new skip events use it to distinguish a quick
-- dismissal from a considered one.
alter table public.product_interactions
  add column if not exists dwell_ms integer;

alter table public.product_interactions
  drop constraint if exists product_interactions_dwell_ms_range;

alter table public.product_interactions
  add constraint product_interactions_dwell_ms_range
  check (dwell_ms is null or dwell_ms between 0 and 3600000);

-- These values live in the database because both the update function and
-- recommendation query need one consistent set of settings. They can be tuned
-- by a server-side operator without shipping browser code.
create table if not exists public.recommendation_negative_settings (
  singleton boolean primary key default true check (singleton),
  quick_skip_dwell_ms integer not null default 2000
    check (quick_skip_dwell_ms between 0 and 3600000),
  quick_skip_learning_rate double precision not null default 0.20
    check (quick_skip_learning_rate > 0 and quick_skip_learning_rate <= 1),
  long_skip_learning_rate double precision not null default 0.05
    check (long_skip_learning_rate > 0 and long_skip_learning_rate <= 1),
  quick_skip_signal_strength double precision not null default 0.75
    check (quick_skip_signal_strength > 0 and quick_skip_signal_strength <= 1),
  long_skip_signal_strength double precision not null default 0.25
    check (long_skip_signal_strength > 0 and long_skip_signal_strength <= 1),
  price_learning_rate double precision not null default 0.10
    check (price_learning_rate > 0 and price_learning_rate <= 1),
  price_signal_strength double precision not null default 0.80
    check (price_signal_strength > 0 and price_signal_strength <= 1),
  price_ceiling_ratio double precision not null default 0.80
    check (price_ceiling_ratio > 0 and price_ceiling_ratio <= 1),
  category_learning_rate double precision not null default 0.10
    check (category_learning_rate > 0 and category_learning_rate <= 1),
  category_signal_strength double precision not null default 0.90
    check (category_signal_strength > 0 and category_signal_strength <= 1),
  similarity_threshold double precision not null default 0.65
    check (similarity_threshold between -1 and 1),
  skip_recommendation_penalty double precision not null default 0.35
    check (skip_recommendation_penalty >= 0 and skip_recommendation_penalty <= 1),
  price_recommendation_penalty double precision not null default 0.25
    check (price_recommendation_penalty >= 0 and price_recommendation_penalty <= 1),
  category_recommendation_penalty double precision not null default 0.45
    check (category_recommendation_penalty >= 0 and category_recommendation_penalty <= 1)
);

insert into public.recommendation_negative_settings (singleton) values (true)
on conflict (singleton) do nothing;

-- Skip feedback captures broad semantic avoidance. It follows the same
-- five-slot clustering rule as positive interests, but stays separate so a
-- rejection never pulls a positive interest away from what the user likes.
create table if not exists public.user_skip_interest_embeddings (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_index smallint not null check (slot_index between 0 and 4),
  embedding vector(384) not null,
  signal_strength double precision not null check (signal_strength > 0 and signal_strength <= 1),
  feedback_count integer not null default 1 check (feedback_count >= 1),
  updated_at timestamptz not null default now(),
  constraint user_skip_interest_embeddings_normalized
    check (vector_norm(embedding) between 0.99 and 1.01),
  primary key (user_id, slot_index)
);

-- Price feedback has its own five semantic contexts. A costly coffee setup
-- should lower expensive coffee recommendations without suppressing cheaper
-- coffee products or unrelated categories.
create table if not exists public.user_price_interest_embeddings (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_index smallint not null check (slot_index between 0 and 4),
  embedding vector(384) not null,
  price_ceiling_cents integer not null check (price_ceiling_cents >= 0),
  signal_strength double precision not null check (signal_strength > 0 and signal_strength <= 1),
  feedback_count integer not null default 1 check (feedback_count >= 1),
  updated_at timestamptz not null default now(),
  constraint user_price_interest_embeddings_normalized
    check (vector_norm(embedding) between 0.99 and 1.01),
  primary key (user_id, slot_index)
);

-- Category feedback is scoped by the catalog's main category. Each row still
-- keeps a vector so more related products within that category receive the
-- largest reduction.
create table if not exists public.user_category_interest_embeddings (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (btrim(category) <> ''),
  embedding vector(384) not null,
  signal_strength double precision not null check (signal_strength > 0 and signal_strength <= 1),
  feedback_count integer not null default 1 check (feedback_count >= 1),
  updated_at timestamptz not null default now(),
  constraint user_category_interest_embeddings_normalized
    check (vector_norm(embedding) between 0.99 and 1.01),
  primary key (user_id, category)
);

-- The idempotency ledger prevents retries or duplicate browser events from
-- repeatedly strengthening the same negative feedback signal.
create table if not exists public.negative_product_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  asin text not null references public.catalog_products(asin) on delete cascade,
  action text not null check (action in ('skip', 'too_expensive', 'less_category')),
  dwell_ms integer,
  skip_kind text check (skip_kind in ('quick', 'long')),
  source_price_cents integer check (source_price_cents is null or source_price_cents >= 0),
  source_category text,
  created_at timestamptz not null default now(),
  primary key (user_id, asin, action),
  check (
    (action = 'skip' and dwell_ms between 0 and 3600000 and skip_kind is not null)
    or (action <> 'skip' and dwell_ms is null and skip_kind is null)
  )
);
create index if not exists negative_product_interactions_asin_idx
  on public.negative_product_interactions (asin);

alter table public.recommendation_negative_settings enable row level security;
alter table public.user_skip_interest_embeddings enable row level security;
alter table public.user_price_interest_embeddings enable row level security;
alter table public.user_category_interest_embeddings enable row level security;
alter table public.negative_product_interactions enable row level security;

revoke all on public.recommendation_negative_settings,
  public.user_skip_interest_embeddings,
  public.user_price_interest_embeddings,
  public.user_category_interest_embeddings,
  public.negative_product_interactions from public, anon, authenticated;

grant select, insert, update, delete on public.recommendation_negative_settings,
  public.user_skip_interest_embeddings,
  public.user_price_interest_embeddings,
  public.user_category_interest_embeddings,
  public.negative_product_interactions to service_role;

-- Positive and negative updates share the per-user advisory lock. This keeps
-- concurrent taps from losing a vector update or creating duplicate slots.
create or replace function public.record_negative_product_interaction(
  p_user_id uuid, p_asin text, p_action text, p_dwell_ms integer default null
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  product_vector vector(384);
  product_price_cents integer;
  product_category text;
  settings record;
  normalized_dwell_ms integer;
  skip_kind text;
  learning_rate double precision;
  strength_increment double precision;
  inferred_price_ceiling integer;
  chosen_slot smallint;
  chosen_similarity double precision;
  interest_count integer;
  previous_vector vector(384);
  previous_values real[];
  product_values real[];
  blended vector(384);
begin
  if p_user_id is null or p_asin is null
     or p_action is null or p_action not in ('skip', 'too_expensive', 'less_category')
     or (p_dwell_ms is not null and p_dwell_ms not between 0 and 3600000)
     or (p_action <> 'skip' and p_dwell_ms is not null) then
    raise exception 'Invalid negative interaction';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into settings from public.recommendation_negative_settings
  where singleton for share;
  if not found then
    raise exception 'Negative recommendation settings are unavailable';
  end if;

  select p.embedding, p.price_cents, nullif(btrim(p.main_category), '')
    into product_vector, product_price_cents, product_category
    from public.catalog_products p where p.asin = p_asin for share;
  if product_vector is null then return false; end if;
  if p_action = 'too_expensive' and coalesce(product_price_cents, 0) <= 0 then
    return false;
  end if;
  if p_action = 'less_category' and product_category is null then
    return false;
  end if;

  if p_action = 'skip' then
    normalized_dwell_ms := coalesce(p_dwell_ms, 0);
    if normalized_dwell_ms <= settings.quick_skip_dwell_ms then
      skip_kind := 'quick';
      learning_rate := settings.quick_skip_learning_rate;
      strength_increment := settings.quick_skip_signal_strength;
    else
      skip_kind := 'long';
      learning_rate := settings.long_skip_learning_rate;
      strength_increment := settings.long_skip_signal_strength;
    end if;
  elsif p_action = 'too_expensive' then
    learning_rate := settings.price_learning_rate;
    strength_increment := settings.price_signal_strength;
    inferred_price_ceiling := greatest(0, round(product_price_cents * settings.price_ceiling_ratio)::integer);
  else
    learning_rate := settings.category_learning_rate;
    strength_increment := settings.category_signal_strength;
  end if;

  insert into public.negative_product_interactions(
    user_id, asin, action, dwell_ms, skip_kind, source_price_cents, source_category
  ) values (
    p_user_id, p_asin, p_action,
    case when p_action = 'skip' then normalized_dwell_ms else null end,
    skip_kind, product_price_cents, product_category
  ) on conflict (user_id, asin, action) do nothing;
  if not found then return false; end if;

  if p_action = 'skip' then
    select count(*) into interest_count from public.user_skip_interest_embeddings i
      where i.user_id = p_user_id;
    select i.slot_index, 1 - (i.embedding <=> product_vector)
      into chosen_slot, chosen_similarity
      from public.user_skip_interest_embeddings i where i.user_id = p_user_id
      order by i.embedding <=> product_vector, i.slot_index limit 1;

    if interest_count = 0
       or (chosen_similarity < settings.similarity_threshold and interest_count < 5) then
      select s.slot_index into chosen_slot from generate_series(0, 4) as s(slot_index)
      where not exists (
        select 1 from public.user_skip_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = s.slot_index
      ) order by s.slot_index limit 1;
      insert into public.user_skip_interest_embeddings(
        user_id, slot_index, embedding, signal_strength
      ) values (p_user_id, chosen_slot, product_vector, strength_increment);
    else
      select i.embedding into previous_vector from public.user_skip_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = chosen_slot for update;
      previous_values := previous_vector::real[];
      product_values := product_vector::real[];
      select array_agg(((1 - learning_rate) * previous_values[n]
                        + learning_rate * product_values[n])::real order by n)::vector(384)
        into blended from generate_series(1, 384) as n;
      update public.user_skip_interest_embeddings i
        set embedding = l2_normalize(blended),
            signal_strength = least(1.0, i.signal_strength + strength_increment),
            feedback_count = i.feedback_count + 1,
            updated_at = now()
        where i.user_id = p_user_id and i.slot_index = chosen_slot;
    end if;
  elsif p_action = 'too_expensive' then
    select count(*) into interest_count from public.user_price_interest_embeddings i
      where i.user_id = p_user_id;
    select i.slot_index, 1 - (i.embedding <=> product_vector)
      into chosen_slot, chosen_similarity
      from public.user_price_interest_embeddings i where i.user_id = p_user_id
      order by i.embedding <=> product_vector, i.slot_index limit 1;

    if interest_count = 0
       or (chosen_similarity < settings.similarity_threshold and interest_count < 5) then
      select s.slot_index into chosen_slot from generate_series(0, 4) as s(slot_index)
      where not exists (
        select 1 from public.user_price_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = s.slot_index
      ) order by s.slot_index limit 1;
      insert into public.user_price_interest_embeddings(
        user_id, slot_index, embedding, price_ceiling_cents, signal_strength
      ) values (
        p_user_id, chosen_slot, product_vector, inferred_price_ceiling, strength_increment
      );
    else
      select i.embedding into previous_vector from public.user_price_interest_embeddings i
        where i.user_id = p_user_id and i.slot_index = chosen_slot for update;
      previous_values := previous_vector::real[];
      product_values := product_vector::real[];
      select array_agg(((1 - learning_rate) * previous_values[n]
                        + learning_rate * product_values[n])::real order by n)::vector(384)
        into blended from generate_series(1, 384) as n;
      update public.user_price_interest_embeddings i
        set embedding = l2_normalize(blended),
            price_ceiling_cents = least(i.price_ceiling_cents, inferred_price_ceiling),
            signal_strength = least(1.0, i.signal_strength + strength_increment),
            feedback_count = i.feedback_count + 1,
            updated_at = now()
        where i.user_id = p_user_id and i.slot_index = chosen_slot;
    end if;
  else
    select i.embedding into previous_vector from public.user_category_interest_embeddings i
      where i.user_id = p_user_id and i.category = product_category for update;
    if found then
      previous_values := previous_vector::real[];
      product_values := product_vector::real[];
      select array_agg(((1 - learning_rate) * previous_values[n]
                        + learning_rate * product_values[n])::real order by n)::vector(384)
        into blended from generate_series(1, 384) as n;
      update public.user_category_interest_embeddings i
        set embedding = l2_normalize(blended),
            signal_strength = least(1.0, i.signal_strength + strength_increment),
            feedback_count = i.feedback_count + 1,
            updated_at = now()
        where i.user_id = p_user_id and i.category = product_category;
    else
      insert into public.user_category_interest_embeddings(
        user_id, category, embedding, signal_strength
      ) values (p_user_id, product_category, product_vector, strength_increment);
    end if;
  end if;
  return true;
end;
$$;

-- Apply avoidance penalties after retrieving candidates near each positive
-- interest. The result still interleaves positive interests, but candidates
-- resembling skipped products, costly products in a rejected price context,
-- and rejected categories rank lower.
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
    return query with settings as (
      select * from public.recommendation_negative_settings where singleton
    ), candidates as (
      select p.asin, p.title, p.brand, p.summary, p.image_url, p.product_url,
        p.price_cents, p.rating, p.review_count, p.categories, p.hashtags,
        p.embedding, p.main_category, p.last_seen_at
      from public.catalog_products p
      where not (p.asin = any(p_exclude_asins))
      order by p.last_seen_at desc, p.asin
      limit least(p_limit * 8, 800)
    ), scored as (
      select c.*, coalesce((
        select max(s.skip_recommendation_penalty * n.signal_strength
          * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding))))
        from public.user_skip_interest_embeddings n cross join settings s
        where n.user_id = p_user_id and c.embedding is not null
      ), 0.0) + coalesce((
        select max(s.price_recommendation_penalty * n.signal_strength
          * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding))))
        from public.user_price_interest_embeddings n cross join settings s
        where n.user_id = p_user_id and c.embedding is not null
          and c.price_cents is not null and c.price_cents >= n.price_ceiling_cents
      ), 0.0) + coalesce((
        select max(s.category_recommendation_penalty * n.signal_strength
          * (0.5 + 0.5 * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding)))))
        from public.user_category_interest_embeddings n cross join settings s
        where n.user_id = p_user_id and c.embedding is not null
          and c.main_category = n.category
      ), 0.0) as penalty
      from candidates c
    )
    select c.asin, c.title, c.brand, c.summary, c.image_url, c.product_url,
      c.price_cents, c.rating, c.review_count, c.categories, c.hashtags,
      greatest(-1.0, least(1.0, -c.penalty))::double precision
    from scored c
    order by c.penalty, c.last_seen_at desc, c.asin
    limit p_limit;
  else
    return query with settings as (
      select * from public.recommendation_negative_settings where singleton
    ), per_interest_candidates as (
      select i.slot_index, c.*, 1 - c.distance as positive_similarity
      from public.user_interest_embeddings i
      cross join lateral (
        select p.asin, p.title, p.brand, p.summary, p.image_url, p.product_url,
          p.price_cents, p.rating, p.review_count, p.categories, p.hashtags,
          p.main_category, p.embedding, p.embedding <=> i.embedding as distance
        from public.catalog_products p
        where p.embedding is not null and not (p.asin = any(p_exclude_asins))
        order by p.embedding <=> i.embedding, p.asin
        limit least(p_limit * 8, 800)
      ) c where i.user_id = p_user_id
    ), scored as (
      select c.*, c.positive_similarity - (
        coalesce((
          select max(s.skip_recommendation_penalty * n.signal_strength
            * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding))))
          from public.user_skip_interest_embeddings n cross join settings s
          where n.user_id = p_user_id
        ), 0.0) + coalesce((
          select max(s.price_recommendation_penalty * n.signal_strength
            * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding))))
          from public.user_price_interest_embeddings n cross join settings s
          where n.user_id = p_user_id and c.price_cents is not null
            and c.price_cents >= n.price_ceiling_cents
        ), 0.0) + coalesce((
          select max(s.category_recommendation_penalty * n.signal_strength
            * (0.5 + 0.5 * greatest(0.0, least(1.0, 1 - (c.embedding <=> n.embedding)))))
          from public.user_category_interest_embeddings n cross join settings s
          where n.user_id = p_user_id and c.main_category = n.category
        ), 0.0)
      ) as personalized_similarity
      from per_interest_candidates c
    ), ranked as (
      select s.*, row_number() over (
        partition by s.slot_index
        order by s.personalized_similarity desc, s.asin
      ) as position
      from scored s
    ), deduplicated as (
      select r.*, row_number() over (
        partition by r.asin
        order by r.personalized_similarity desc, r.position, r.slot_index
      ) as duplicate_rank
      from ranked r
    )
    select d.asin, d.title, d.brand, d.summary, d.image_url, d.product_url,
      d.price_cents, d.rating, d.review_count, d.categories, d.hashtags,
      greatest(-1.0, least(1.0, d.personalized_similarity))::double precision
    from deduplicated d where d.duplicate_rank = 1
    order by d.position, d.slot_index, d.personalized_similarity desc, d.asin
    limit p_limit;
  end if;
end;
$$;

-- Explicitly revoke PostgREST's default function grants. Express invokes both
-- RPCs through its service-role client only after it verifies the user token.
revoke all on function public.record_negative_product_interaction(uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.recommend_catalog_products(uuid, integer, text[])
  from public, anon, authenticated;
grant execute on function public.record_negative_product_interaction(uuid, text, text, integer)
  to service_role;
grant execute on function public.recommend_catalog_products(uuid, integer, text[])
  to service_role;
