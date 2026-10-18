set search_path = public, extensions;

-- Product titles and hashtag lists carry different semantic signals. Keep their
-- vectors separate so the existing recommendation embedding remains unchanged.
alter table public.catalog_products
  add column if not exists title_embedding vector(384);

alter table public.catalog_products
  add constraint catalog_products_title_embedding_normalized
  check (title_embedding is null or vector_norm(title_embedding) between 0.99 and 1.01);

-- A title edit makes its previous vector stale. The next backfill or catalog
-- enrichment job can safely fill the NULL value.
create or replace function public.invalidate_catalog_title_embedding()
returns trigger language plpgsql set search_path = pg_catalog, public, extensions as $$
begin
  if new.title is distinct from old.title then
    new.title_embedding = null;
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_catalog_title_embedding() from public, anon, authenticated;
drop trigger if exists invalidate_catalog_title_embedding on public.catalog_products;
create trigger invalidate_catalog_title_embedding before update of title on public.catalog_products
for each row execute function public.invalidate_catalog_title_embedding();

-- The source title comparison prevents a delayed worker from saving an
-- embedding for an earlier version of the title.
create or replace function public.save_catalog_title_embedding(
  p_asin text, p_title text, p_embedding vector(384)
) returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
begin
  if p_embedding is null or vector_norm(p_embedding) < 0.99
     or vector_norm(p_embedding) > 1.01 then
    raise exception 'Expected a normalized title embedding';
  end if;
  update public.catalog_products p set title_embedding = p_embedding
  where p.asin = p_asin and p.title = p_title and p.title_embedding is null;
  return found;
end;
$$;

-- Revoke direct API-role access explicitly. The existing recommendation RPCs
-- also need this because Supabase projects can grant execute to these roles by
-- default; Express invokes them through the service-role client after auth.
revoke all on function public.save_catalog_embedding(text, text[], vector)
  from public, anon, authenticated;
revoke all on function public.record_positive_product_interaction(uuid, text, text, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.recommend_catalog_products(uuid, integer, text[])
  from public, anon, authenticated;
revoke all on function public.save_catalog_title_embedding(text, text, vector)
  from public, anon, authenticated;

grant execute on function public.save_catalog_title_embedding(text, text, vector) to service_role;
