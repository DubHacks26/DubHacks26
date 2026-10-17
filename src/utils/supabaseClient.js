"use client";

import { createClient } from "@supabase/supabase-js";

let supabaseClient;

function getSupabaseClient() {
  if (typeof window === "undefined") {
    throw new Error("The Supabase auth client can only be used in the browser.");
  }

  if (!supabaseClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error(
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
      );
    }

    supabaseClient = createClient(supabaseUrl, supabasePublishableKey);
  }

  return supabaseClient;
}

export { getSupabaseClient };
