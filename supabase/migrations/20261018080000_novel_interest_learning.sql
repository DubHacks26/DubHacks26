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
  effective_learning_rate double precision;
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
    -- Match NOVEL_INTEREST_LEARNING_RATE in lib/recommendation-config.cjs.
    -- Only novel likes at capacity get the stronger nudge; saves stay gentle.
    effective_learning_rate := case
      when p_action = 'like' and interest_count = 5 and chosen_similarity < p_threshold
        then 0.5
      else p_learning_rate
    end;
    previous_values := previous_vector::real[];
    product_values := product_vector::real[];
    select array_agg(((1 - effective_learning_rate) * previous_values[n]
                      + effective_learning_rate * product_values[n])::real order by n)::vector(384)
      into blended from generate_series(1, 384) as n;
    update public.user_interest_embeddings i
      set embedding = case when vector_norm(blended) = 0 then product_vector
        else l2_normalize(blended) end
      where i.user_id = p_user_id and i.slot_index = chosen_slot;
  end if;
  return true;
end;
$$;
revoke all on function public.record_positive_product_interaction(uuid, text, text, double precision, double precision) from public, anon, authenticated;
grant execute on function public.record_positive_product_interaction(uuid, text, text, double precision, double precision) to service_role;

