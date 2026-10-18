alter table public.catalog_products
  add column if not exists main_category text,
  add column if not exists subcategory text;

create index if not exists catalog_products_main_category_idx
  on public.catalog_products (main_category);

create index if not exists catalog_products_subcategory_idx
  on public.catalog_products (subcategory);

grant select (
  asin,
  title,
  brand,
  summary,
  image_url,
  product_url,
  price_cents,
  rating,
  review_count,
  availability,
  hashtags,
  main_category,
  subcategory,
  bought_in_past_month
) on public.catalog_products to authenticated;

drop policy if exists "Authenticated users can view catalog products"
  on public.catalog_products;

create policy "Authenticated users can view catalog products"
  on public.catalog_products
  for select
  to authenticated
  using (true);

create table if not exists public.user_feed_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  categories text[] not null default '{}',
  min_price_cents integer not null default 2000 check (min_price_cents >= 0),
  max_price_cents integer not null default 15000
    check (max_price_cents >= min_price_cents),
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_feed_preferences enable row level security;
revoke all on public.user_feed_preferences from anon, authenticated;
grant select, insert, update on public.user_feed_preferences to authenticated;

drop policy if exists "Users manage their own feed preferences"
  on public.user_feed_preferences;

create policy "Users manage their own feed preferences"
  on public.user_feed_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.product_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  asin text not null references public.catalog_products (asin) on delete cascade,
  action text not null check (action in ('like', 'save', 'unsave', 'skip', 'show_less')),
  created_at timestamptz not null default now()
);

create index if not exists product_interactions_user_created_idx
  on public.product_interactions (user_id, created_at desc);

create index if not exists product_interactions_user_asin_idx
  on public.product_interactions (user_id, asin);

alter table public.product_interactions enable row level security;
revoke all on public.product_interactions from anon, authenticated;
grant select, insert, delete on public.product_interactions to authenticated;

drop policy if exists "Users read their own product interactions"
  on public.product_interactions;

create policy "Users read their own product interactions"
  on public.product_interactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own product interactions"
  on public.product_interactions;

create policy "Users add their own product interactions"
  on public.product_interactions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users remove their own product interactions"
  on public.product_interactions;

create policy "Users remove their own product interactions"
  on public.product_interactions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
