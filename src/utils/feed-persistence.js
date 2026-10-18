import { getSupabaseClient } from "@/utils/supabaseClient";
import { restoreProfile } from "@/utils/feed.mjs";

async function fetchAll(query, pageSize = 500) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadFeedProfile(userId) {
  const supabase = getSupabaseClient();
  const [{ data: preferenceRow, error: preferenceError }, events] = await Promise.all([
    supabase
      .from("user_feed_preferences")
      .select("categories,min_price_cents,max_price_cents,onboarded")
      .eq("user_id", userId)
      .maybeSingle(),
    fetchAll(
      supabase
        .from("product_interactions")
        .select("id,asin,action,dwell_ms,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ),
  ]);
  if (preferenceError) throw new Error(preferenceError.message);

  const historyAsins = [...new Set(events.map((event) => event.asin))];
  const historyProducts = [];
  for (let from = 0; from < historyAsins.length; from += 100) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select("asin,title,brand,summary,image_url,product_url,price_cents,rating,review_count,availability,hashtags,main_category,subcategory,bought_in_past_month")
      .in("asin", historyAsins.slice(from, from + 100));
    if (error) throw new Error(error.message);
    historyProducts.push(...(data || []));
  }

  const profile = restoreProfile({
    preferences: preferenceRow
      ? {
          categories: preferenceRow.categories || [],
          minPrice: Number(preferenceRow.min_price_cents ?? 2000) / 100,
          maxPrice: Number(preferenceRow.max_price_cents ?? 15000) / 100,
        }
      : undefined,
    onboarded: preferenceRow?.onboarded === true,
    events: events.map((event) => ({
      id: event.id,
      productId: event.asin,
      action: event.action,
      dwellMs: event.dwell_ms,
      createdAt: event.created_at,
    })),
  });
  return {
    profile,
    hasRemoteData: Boolean(preferenceRow || events.length),
    historyProducts,
  };
}

export async function migrateLegacyProfile(userId, profile) {
  await saveFeedPreferences(userId, profile.preferences, profile.onboarded);
  const rows = profile.events
    .filter((event) => /^[A-Z0-9]{10}$/.test(String(event.productId)))
    .map((event) => ({
      user_id: userId,
      asin: event.productId,
      action: event.action,
      created_at: event.createdAt,
    }));
  for (let from = 0; from < rows.length; from += 500) {
    const { error } = await getSupabaseClient()
      .from("product_interactions")
      .insert(rows.slice(from, from + 500));
    if (error) throw new Error(error.message);
  }
}

export async function saveFeedPreferences(userId, preferences, onboarded = true) {
  const { error } = await getSupabaseClient()
    .from("user_feed_preferences")
    .upsert({
      user_id: userId,
      categories: preferences.categories,
      min_price_cents: Math.round(preferences.minPrice * 100),
      max_price_cents: Math.round(preferences.maxPrice * 100),
      onboarded,
    }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function saveProductAction(userId, asin, action, { dwellMs } = {}) {
  const normalizedDwellMs = Number.isInteger(dwellMs) && dwellMs >= 0 && dwellMs <= 3600000
    ? dwellMs
    : null;
  const { data, error } = await getSupabaseClient()
    .from("product_interactions")
    .insert({ user_id: userId, asin, action, dwell_ms: normalizedDwellMs })
    .select("id,asin,action,dwell_ms,created_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    productId: data.asin,
    action: data.action,
    dwellMs: data.dwell_ms,
    createdAt: data.created_at,
  };
}

export async function deleteProductAction(userId, eventId) {
  const { error } = await getSupabaseClient()
    .from("product_interactions")
    .delete()
    .eq("user_id", userId)
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}
