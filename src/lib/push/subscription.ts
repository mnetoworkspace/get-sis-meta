import { createSupabaseAdminClient } from "@/lib/supabase";

interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function savePushSubscription(input: SubscribeInput): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(input, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export async function isPushSubscribed(endpoint: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
