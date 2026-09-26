import { createSupabaseAdminClient } from "@/lib/supabase";
import { accountStatusDescription, fetchAdAccountStatus, fetchBusinessStatus, MetaApiError } from "@/lib/meta";
import { sendPushToAll } from "@/lib/push/send";
import { notificationDecision } from "@/lib/notifications/settings";
import type { AdAccount, BusinessManager, MetaCredential } from "@/types/db";

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Checa se a própria BM (não uma conta específica) está respondendo pro
// token dela — uma BM bloqueada geralmente derruba TODAS as contas de uma
// vez, então vale a pena distinguir isso de um bloqueio pontual de conta.
async function checkBusinessStatus(
  bm: BusinessManager,
  token: string,
  pushEnabled: boolean,
  silent: boolean,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const result = await fetchBusinessStatus(bm.id, token);
  const currentStatus = result.ok ? "ACTIVE" : "ERROR";
  const detail = result.ok ? null : result.message;

  const { error: updateError } = await supabase
    .from("business_managers")
    .update({ meta_status: currentStatus, meta_status_detail: detail, status_checked_at: new Date().toISOString() })
    .eq("id", bm.id);
  if (updateError) {
    console.error(`[account-status-watch] falha ao atualizar status da BM ${bm.id}:`, updateError);
  }

  if (currentStatus === bm.meta_status) return;

  const becameProblem = bm.meta_status !== "ERROR" && currentStatus === "ERROR";
  const recovered = bm.meta_status === "ERROR" && currentStatus === "ACTIVE";
  if (!becameProblem && !recovered) return; // ex: primeira leitura, sem status salvo ainda

  const dedupeKey = `BM_STATUS:${bm.id}:${currentStatus}:${new Date().toISOString().slice(0, 10)}`;
  const body = becameProblem
    ? `${bm.name} — a API da Meta parou de responder pro token dessa BM: "${detail}". Pode ser bloqueio da BM inteira.`
    : `${bm.name} — voltou a responder normalmente.`;

  const { error: insertError } = await supabase.from("notifications").insert({
    type: "bm_status",
    title: becameProblem ? "Business Manager com problema" : "Business Manager normalizada",
    body,
    metadata: { bm_id: bm.id, bm_name: bm.name, previous_status: bm.meta_status, new_status: currentStatus, detail },
    dedupe_key: dedupeKey,
  });

  if (insertError) {
    if (!isUniqueViolation(insertError)) {
      console.error("[account-status-watch] falha ao registrar notificação de BM:", insertError);
    }
    return;
  }

  if (!pushEnabled) return;

  await sendPushToAll({
    title: becameProblem ? "🚫 Business Manager com problema" : "✅ Business Manager normalizada",
    body,
    url: "/",
    silent,
  });
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
    const { data: bm } = await supabase
      .from("business_managers")
      .select("*")
      .eq("id", credential.bm_id)
      .maybeSingle<BusinessManager>();
    if (bm) {
      await checkBusinessStatus(bm, credential.system_user_token, pushEnabled, silent);
    }

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

      // Título específico pra falha de pagamento (UNSETTLED) — é um
      // problema diferente de "bloqueada por política" (DISABLED) e pede
      // uma ação diferente (atualizar cartão, não abrir contestação).
      const isPaymentIssue = currentStatus === "UNSETTLED";
      const description = accountStatusDescription(currentStatus);
      const title = becameProblem
        ? isPaymentIssue
          ? "Falha de pagamento em conta de anúncio"
          : "Conta de anúncio com problema"
        : "Conta de anúncio reativada";
      const body = becameProblem
        ? `${account.name} — ${currentStatus}${description ? `: ${description}` : "."}`
        : `${account.name} — voltou a ficar ativa.`;

      const { error: insertError } = await supabase.from("notifications").insert({
        type: "account_status",
        title,
        body,
        metadata: {
          ad_account_id: account.id,
          previous_status: account.status,
          new_status: currentStatus,
          status_description: description,
        },
        dedupe_key: dedupeKey,
      });

      if (insertError) {
        if (!isUniqueViolation(insertError)) {
          console.error("[account-status-watch] falha ao registrar notificação:", insertError);
        }
        continue;
      }

      if (!pushEnabled) continue;

      const emoji = becameProblem ? (isPaymentIssue ? "💳" : "🚫") : "✅";
      await sendPushToAll({
        title: `${emoji} ${title}`,
        body,
        url: "/",
        silent,
      });
    }
  }
}
