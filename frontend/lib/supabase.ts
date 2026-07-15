import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for Auth + reading the user's own rows (RLS-guarded).
 * Uses the PUBLIC anon key only — safe to expose. Returns null when the env vars
 * aren't set yet, so the app runs fine without Supabase configured.
 */
// Trim/strip whitespace: values pasted into a dashboard often pick up a trailing
// newline or space, which becomes an illegal HTTP header value and makes every
// auth fetch throw "Failed to execute 'fetch': Invalid value". A JWT and a URL
// never legitimately contain whitespace, so it's safe to remove it all.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/\s/g, "");

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = !!supabase;
