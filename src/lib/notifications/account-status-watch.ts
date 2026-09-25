import { createSupabaseAdminClient } from "@/lib/supabase";
import { fetchAdAccountStatus, MetaApiError } from "@/lib/meta";
import { sendPushToAll } from "@/lib/push/send";
import { notificationDecision } from "@/lib/notifications/settings";
import type { AdAccount, MetaCredential } from "@/types/db";

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Compara o status atual na Meta com o salvo em `ad_accounts` e avisa
// quando uma conta sai de ACTIVE (desabilitada, em revisão de risco,
// fechada, etc.) — e também quando ela volta a ficar ACTIVE.
export async function checkAccountStatus(): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: credentials, error: credError } = await supabase
    .from("meta_credentials")
    .select("*")
    .returns<MetaCredential[]>();

  if (credError || !credentials) {
    console.error("[account-status-watch] falha ao carregar credenciais:", credError);
    return;
  }

  const { enabled: pushEnabled, silent } = await notificationDecision("account_status");

  for (const credential of credentials) {
    const { data: accounts, error: accError } = await supabase
      .from("ad_accounts")
      .select("*")
      .eq("bm_id", credential.bm_id)
      .eq("is_active", true)
      .returns<AdAccount[]>();

    if (accError || !accounts) {
      console.error(`[account-status-watch] falha ao carregar contas do BM ${credential.bm_id}:`, accError);
      continue;
    }

    for (const account of accounts) {
      let currentStatus: string;
      try {
        currentStatus = await fetchAdAccountStatus(account.id, credential.system_user_token);
      } catch (err) {
        if (err instanceof MetaApiError) {
          console.error(`[account-status-watch] falha ao checar status de ${account.id}:`, err.message);
        } else {
          console.error(`[account-status-watch] falha ao checar status de ${account.id}:`, err);
        }
        continue;
      }

      if (currentStatus === account.status) continue;

      const { error: updateError } = await supabase
        .from("ad_accounts")
        .update({ status: currentStatus })
        .eq("id", account.id);
      if (updateError) {
        console.error(`[account-status-watch] falha ao atualizar status de ${account.id}:`, updateError);
      }

      const becameProblem = account.status === "ACTIVE" && currentStatus !== "ACTIVE";
      const recovered = account.status !== "ACTIVE" && currentStatus === "ACTIVE";
      if (!becameProblem && !recovered) continue; // ex: primeira leitura sem status salvo ainda

      const dedupeKey = `ACCOUNT_STATUS:${account.id}:${currentStatus}:${new Date().toISOString().slice(0, 10)}`;

      const { error: insertError } = await supabase.from("notifications").insert({
        type: "account_status",
        title: becameProblem ? "Conta de anúncio bloqueada" : "Conta de anúncio reativada",
        body: `${account.name} — status mudou para ${currentStatus}.`,
        metadata: { ad_account_id: account.id, previous_status: account.status, new_status: currentStatus },
        dedupe_key: dedupeKey,
      });

      if (insertError) {
        if (!isUniqueViolation(insertError)) {
          console.error("[account-status-watch] falha ao registrar notificação:", insertError);
        }
        continue;
      }

      if (!pushEnabled) continue;

      await sendPushToAll({
        title: becameProblem ? "🚫 Conta de anúncio bloqueada" : "✅ Conta de anúncio reativada",
        body: `${account.name} — status mudou para ${currentStatus}.`,
        url: "/",
        silent,
      });
    }
  }
}
