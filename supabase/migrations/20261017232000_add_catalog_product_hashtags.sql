alter table public.catalog_products
  add column if not exists hashtags text[] not null default '{}';

create index if not exists catalog_products_hashtags_idx
  on public.catalog_products using gin (hashtags);
