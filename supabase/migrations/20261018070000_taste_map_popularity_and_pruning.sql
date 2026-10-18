-- Return the most popular embedded hashtags for the unseeded taste map.
-- Popularity is the number of distinct catalog products carrying the hashtag.
-- The client requests up to 500 nodes and only receives relationships at or
-- above the display similarity threshold.
create or replace function public.get_hashtag_graph(
  p_name text default null, p_limit integer default 500, p_link_limit integer default 2000
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, extensions as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 500
    or p_link_limit is null or p_link_limit not between 1 and 2000
    or (p_name is not null and (p_name = '' or length(p_name) > 512)) then
    raise exception 'Invalid hashtag graph query';
  end if;
  with product_popularity as materialized (
    select normalized.name, count(distinct p.asin)::bigint as popularity
    from public.catalog_products p
    cross join lateral unnest(p.hashtags) raw(tag)
    cross join lateral (
      select lower(btrim(regexp_replace(
        replace(regexp_replace(btrim(raw.tag), '^#+', ''), '_', ' '),
        '[[:space:]]+', ' ', 'g'
      ))) as name
    ) normalized
    where normalized.name <> ''
    group by normalized.name
  ), seed as (
    select h.id from public.hashtags h where h.name = p_name and h.embedding is not null
  ), candidates as (
    select h.id, h.name, 0::integer as tier, 0::double precision as relevance,
      coalesce(popularity.popularity, 0)::bigint as popularity
    from public.hashtags h
    left join product_popularity popularity on popularity.name = h.name
    where p_name is null and h.embedding is not null
    union all
    select h.id, h.name, 2, 1.0::double precision,
      coalesce(popularity.popularity, 0)::bigint
    from public.hashtags h join seed s on h.id = s.id
    left join product_popularity popularity on popularity.name = h.name
    union all
    select h.id, h.name, 1, e.similarity,
      coalesce(popularity.popularity, 0)::bigint
    from seed s
    join public.hashtag_edges e on e.source_id = s.id or e.target_id = s.id
    join public.hashtags h on h.id = case when e.source_id = s.id then e.target_id else e.source_id end
    left join product_popularity popularity on popularity.name = h.name
    where h.embedding is not null and e.similarity >= 0.55
  ), chosen as materialized (
    select * from candidates
    order by tier desc, relevance desc, popularity desc, name, id
    limit p_limit
  ), links as (
    select e.* from public.hashtag_edges e
    join chosen a on a.id = e.source_id
    join chosen b on b.id = e.target_id
    where e.similarity >= 0.55
    order by e.similarity desc, e.source_id, e.target_id
    limit p_link_limit
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', replace(c.name, ' ', '_'),
      'popularity', c.popularity
    ) order by c.tier desc, c.relevance desc, c.popularity desc, c.name, c.id) from chosen c), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object(
      'source', l.source_id,
      'target', l.target_id,
      'similarity', l.similarity
    ) order by l.similarity desc, l.source_id, l.target_id) from links l), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_hashtag_graph(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_hashtag_graph(text, integer, integer) to service_role;
