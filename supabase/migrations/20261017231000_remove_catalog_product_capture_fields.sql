alter table public.catalog_products
  drop column if exists delivery_text,
  drop column if exists raw;
