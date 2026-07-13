import { supabase } from "./supabase";

/** Max generations per user per day (cloud models cost money, so cap it). */
export const DAILY_CAP = 25;

/**
 * Atomically bump today's generation count and return the new total.
 * Backed by the `increment_usage()` SQL function (runs under the caller's RLS).
 */
export async function incrementUsage(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("increment_usage");
  if (error) throw error;
  return (data as number) ?? 0;
}
