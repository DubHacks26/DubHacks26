set search_path = public, extensions;

-- Independent from catalog_products.embedding and user_interest_embeddings.
-- NULL embeddings form a durable work queue; names/IDs survive graph rebuilds.
create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name <> '' and name = lower(btrim(name))
    and name !~ '^#' and name !~ '_' and name !~ '[[:space:]]{2,}'),
  embedding vector(384),
  graph_pending boolean not null default true,
  claim_token uuid,
  claimed_at timestamptz,
  check (embedding is null or vector_norm(embedding) between 0.999 and 1.001),
  check ((claim_token is null) = (claimed_at is null))
);
create index hashtags_pending_embedding_idx on public.hashtags (name) where embedding is null;
create index hashtags_pending_graph_idx on public.hashtags (id) where graph_pending;

-- Keep directed selections so an edge is retained if EITHER endpoint selects it.
-- This also allows a newly discovered neighbor to displace obsolete selections.
create table public.hashtag_neighbors (
  source_id uuid not null references public.hashtags(id) on delete cascade,
  target_id uuid not null references public.hashtags(id) on delete cascade,
  rank smallint not null check (rank between 1 and 50),
  similarity double precision not null check (similarity between -1 and 1),
  primary key (source_id, target_id),
  unique (source_id, rank),
  check (source_id <> target_id)
);
create index hashtag_neighbors_target_idx on public.hashtag_neighbors (target_id);

create table public.hashtag_edges (
  source_id uuid not null references public.hashtags(id) on delete cascade,
  target_id uuid not null references public.hashtags(id) on delete cascade,
  similarity double precision not null check (similarity between -1 and 1),
  primary key (source_id, target_id),
  check (source_id < target_id)
);
create index hashtag_edges_target_idx on public.hashtag_edges (target_id);

create table public.hashtag_graph_settings (
  singleton boolean primary key default true check (singleton),
  neighbor_count integer not null check (neighbor_count between 1 and 50),
  similarity_threshold double precision not null check (similarity_threshold between -1 and 1)
);
insert into public.hashtag_graph_settings values (true, 8, 0.65);

alter table public.hashtags enable row level security;
alter table public.hashtag_neighbors enable row level security;
alter table public.hashtag_edges enable row level security;
alter table public.hashtag_graph_settings enable row level security;
revoke all on public.hashtags, public.hashtag_neighbors, public.hashtag_edges,
  public.hashtag_graph_settings from public, anon, authenticated;
grant select, insert, update, delete on public.hashtags, public.hashtag_neighbors,
  public.hashtag_edges, public.hashtag_graph_settings to service_role;

create function public.claim_hashtag_embedding()
returns table (id uuid, name text, claim_token uuid)
language sql security definer set search_path = pg_catalog, public, extensions as $$
  with candidate as (
    select h.id from public.hashtags h
    where h.embedding is null
      and (h.claimed_at is null or h.claimed_at < now() - interval '15 minutes')
    order by h.name for update skip locked limit 1
  )
  update public.hashtags h set claim_token = gen_random_uuid(), claimed_at = now()
  from candidate c where h.id = c.id returning h.id, h.name, h.claim_token;
$$;

create function public.finish_hashtag_embedding(p_id uuid, p_token uuid, p_embedding vector(384))
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
begin
  if p_embedding is not null and not (vector_norm(p_embedding) between 0.999 and 1.001) then
    raise exception 'Expected a normalized 384D embedding';
  end if;
  -- Share the graph-writer lock: a build cannot clear pending work written midway.
  perform pg_advisory_xact_lock(1784519201);
  update public.hashtags h set embedding = p_embedding, graph_pending = true,
    claim_token = null, claimed_at = null
  where h.id = p_id and h.claim_token = p_token and h.embedding is null;
  return found;
end;
$$;

create function public.refresh_hashtag_graph(
  p_neighbors integer default 8, p_threshold double precision default 0.65,
  p_rebuild boolean default false
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, extensions as $$
declare
  dirty uuid[];
  affected uuid[];
  rebuild boolean;
begin
  if p_neighbors is null or p_neighbors not between 1 and 50
    or p_threshold is null or p_threshold not between -1 and 1 or p_rebuild is null then
    raise exception 'Invalid hashtag graph settings';
  end if;
  perform pg_advisory_xact_lock(1784519201);
  select p_rebuild or s.neighbor_count <> p_neighbors
    or s.similarity_threshold <> p_threshold into rebuild
    from public.hashtag_graph_settings s where s.singleton for update;
  -- A missing settings row is repaired by a full build.
  rebuild := coalesce(rebuild, true);
  select coalesce(array_agg(h.id), '{}'::uuid[]) into dirty
    from public.hashtags h where h.embedding is not null and h.graph_pending;

  if rebuild then
    select coalesce(array_agg(h.id), '{}'::uuid[]) into affected
      from public.hashtags h where h.embedding is not null;
    delete from public.hashtag_neighbors;
    delete from public.hashtag_edges;
  else
    if cardinality(dirty) = 0 then
      return jsonb_build_object('refreshed_sources', 0, 'rebuilt', false);
    end if;
    -- Only new nodes and existing nodes whose top-k could change are rebuilt.
    -- Exact pgvector comparisons happen in PostgreSQL, never all-pairs in Node.
    -- >= deliberately includes ties; UUID ordering below resolves them stably.
    select coalesce(array_agg(h.id), '{}'::uuid[]) into affected
    from public.hashtags h
    left join lateral (
      select count(*) as selections, min(n.similarity) as floor
      from public.hashtag_neighbors n where n.source_id = h.id
    ) current_neighbors on true
    where h.embedding is not null and (
      h.id = any(dirty)
      or exists (select 1 from public.hashtag_neighbors n
                 where n.source_id = h.id and n.target_id = any(dirty))
      or exists (
        select 1 from public.hashtags d where d.id = any(dirty) and d.id <> h.id
          and 1 - (h.embedding <=> d.embedding) >= p_threshold
          and (current_neighbors.selections < p_neighbors
            or 1 - (h.embedding <=> d.embedding) >= current_neighbors.floor)
      )
    );
    delete from public.hashtag_neighbors n where n.source_id = any(affected);
    delete from public.hashtag_edges e
      where e.source_id = any(affected) or e.target_id = any(affected);
  end if;

  insert into public.hashtag_neighbors (source_id, target_id, rank, similarity)
  select h.id, nearest.id,
    row_number() over (partition by h.id order by nearest.distance, nearest.id)::smallint,
    greatest(-1.0, least(1.0, 1 - nearest.distance))
  from public.hashtags h cross join lateral (
    select n.id, h.embedding <=> n.embedding as distance
    from public.hashtags n where n.embedding is not null and n.id <> h.id
      and 1 - (h.embedding <=> n.embedding) >= p_threshold
    order by h.embedding <=> n.embedding, n.id limit p_neighbors
  ) nearest where h.id = any(affected);

  insert into public.hashtag_edges (source_id, target_id, similarity)
  select least(n.source_id, n.target_id), greatest(n.source_id, n.target_id), max(n.similarity)
  from public.hashtag_neighbors n
  where rebuild or n.source_id = any(affected) or n.target_id = any(affected)
  group by least(n.source_id, n.target_id), greatest(n.source_id, n.target_id);

  update public.hashtags h set graph_pending = false where h.id = any(affected);
  insert into public.hashtag_graph_settings values (true, p_neighbors, p_threshold)
  on conflict (singleton) do update set neighbor_count = excluded.neighbor_count,
    similarity_threshold = excluded.similarity_threshold;
  return jsonb_build_object('refreshed_sources', cardinality(affected), 'rebuilt', rebuild);
end;
$$;

-- Read-only, bounded induced subgraph. A named seed selects its strongest direct
-- neighbors; no seed selects the first names alphabetically, including isolates.
create function public.get_hashtag_graph(
  p_name text default null, p_limit integer default 100, p_link_limit integer default 500
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, extensions as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 300
    or p_link_limit is null or p_link_limit not between 1 and 2000
    or (p_name is not null and (p_name = '' or length(p_name) > 512)) then
    raise exception 'Invalid hashtag graph query';
  end if;
  with seed as (
    select h.id from public.hashtags h where h.name = p_name and h.embedding is not null
  ), candidates as (
    select h.id, h.name, 0.0::double precision as priority
      from public.hashtags h where p_name is null and h.embedding is not null
    union all
    select h.id, h.name, 2.0 from public.hashtags h join seed s on h.id = s.id
    union all
    select h.id, h.name, e.similarity from seed s
      join public.hashtag_edges e on e.source_id = s.id or e.target_id = s.id
      join public.hashtags h on h.id = case when e.source_id = s.id then e.target_id else e.source_id end
      where h.embedding is not null
  ), chosen as materialized (
    select * from candidates order by priority desc, name, id limit p_limit
  ), links as (
    select e.* from public.hashtag_edges e
      join chosen a on a.id = e.source_id join chosen b on b.id = e.target_id
      order by e.similarity desc, e.source_id, e.target_id limit p_link_limit
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', replace(c.name, ' ', '_'))
      order by c.priority desc, c.name, c.id) from chosen c), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('source', l.source_id,
      'target', l.target_id, 'similarity', l.similarity)
      order by l.similarity desc, l.source_id, l.target_id) from links l), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Explicitly revoke Supabase's direct default grants as well as PUBLIC grants.
revoke all on function public.claim_hashtag_embedding() from public, anon, authenticated;
revoke all on function public.finish_hashtag_embedding(uuid, uuid, vector) from public, anon, authenticated;
revoke all on function public.refresh_hashtag_graph(integer, double precision, boolean) from public, anon, authenticated;
revoke all on function public.get_hashtag_graph(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_hashtag_embedding() to service_role;
grant execute on function public.finish_hashtag_embedding(uuid, uuid, vector) to service_role;
grant execute on function public.refresh_hashtag_graph(integer, double precision, boolean) to service_role;
grant execute on function public.get_hashtag_graph(text, integer, integer) to service_role;
