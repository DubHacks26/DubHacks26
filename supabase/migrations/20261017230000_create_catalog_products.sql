create table if not exists public.catalog_products (
  asin text primary key check (asin ~ '^[A-Z0-9]{10}$'),
  title text not null,
  brand text,
  summary text,
  image_url text,
  product_url text not null,
  price_cents integer check (price_cents is null or price_cents >= 0),
  price_text text,
  rating numeric(2, 1) check (rating is null or rating between 0 and 5),
  rating_text text,
  review_count integer check (review_count is null or review_count >= 0),
  review_count_text text,
  availability text,
  capture_source text,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  bought_in_past_month text,
  delivery_text text,
  badge text,
  captured_at timestamptz not null,
  last_seen_at timestamptz not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_products_last_seen_at_idx
  on public.catalog_products (last_seen_at desc);

create index if not exists catalog_products_categories_idx
  on public.catalog_products using gin (categories);

alter table public.catalog_products enable row level security;

create or replace function public.set_catalog_products_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_catalog_products_updated_at() from public;

drop trigger if exists set_catalog_products_updated_at on public.catalog_products;
create trigger set_catalog_products_updated_at
before update on public.catalog_products
for each row execute function public.set_catalog_products_updated_at();

revoke all on table public.catalog_products from anon, authenticated;
grant select, insert, update, delete on table public.catalog_products to service_role;
