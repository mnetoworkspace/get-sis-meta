import { createSupabaseAdminClient } from "@/lib/supabase";

// Resolve o token de System User a partir do ID da conta de anúncio — usado
// pelas rotas do painel de gerenciamento manual (ver src/app/ads), que
// recebem só o ID da conta vindo do front, nunca o token.
export async function resolveAccountToken(accountId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data: account } = await supabase
    .from("ad_accounts")
    .select("bm_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!account) return null;

  const { data: credential } = await supabase
    .from("meta_credentials")
    .select("system_user_token")
    .eq("bm_id", account.bm_id)
    .maybeSingle();

  return credential?.system_user_token ?? null;
}
