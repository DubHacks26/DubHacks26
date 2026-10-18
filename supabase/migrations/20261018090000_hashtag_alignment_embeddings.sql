create or replace function public.get_hashtag_embeddings(p_node_ids uuid[])
returns table (id uuid, embedding vector(384))
language sql stable security definer
set search_path = pg_catalog, public, extensions as $$
  select h.id, h.embedding
  from public.hashtags h
  where h.id = any(coalesce(p_node_ids, '{}'::uuid[]));
$$;

revoke all on function public.get_hashtag_embeddings(uuid[]) from public, anon, authenticated;
grant execute on function public.get_hashtag_embeddings(uuid[]) to service_role;