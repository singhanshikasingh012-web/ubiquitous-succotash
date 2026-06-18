import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const normalizedSupabaseUrl = supabaseUrl.startsWith("http://") || supabaseUrl.startsWith("https://")
    ? supabaseUrl
    : `https://${supabaseUrl}`;

  return createClient(normalizedSupabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}