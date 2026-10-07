import { randomBytes } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";

// Categoria "de configuração" — mais grossa que o `type` salvo em cada
// notificação (ex: rule_pause/rule_activate/rule_increase_budget/
// rule_decrease_budget caem todos em "rules") porque não faz sentido pedir
// pra pessoa configurar 4 toggles separados pra regra de automação.
export type NotificationCategory = "deposit" | "deposit_silence" | "rules" | "account_status" | "webhook";

export interface NotificationSettings {
  deposit_enabled: boolean;
  deposit_silent: boolean;
  deposit_silence_enabled: boolean;
  deposit_silence_silent: boolean;
  rules_enabled: boolean;
  rules_silent: boolean;
  account_status_enabled: boolean;
  account_status_silent: boolean;
  webhook_enabled: boolean;
  webhook_silent: boolean;
}

const DEFAULTS: NotificationSettings = {
  deposit_enabled: true,
  deposit_silent: false,
  deposit_silence_enabled: true,
  deposit_silence_silent: false,
  rules_enabled: true,
  rules_silent: false,
  account_status_enabled: true,
  account_status_silent: false,
  webhook_enabled: true,
  webhook_silent: false,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULTS;
  return {
    deposit_enabled: data.deposit_enabled,
    deposit_silent: data.deposit_silent,
    deposit_silence_enabled: data.deposit_silence_enabled,
    deposit_silence_silent: data.deposit_silence_silent,
    rules_enabled: data.rules_enabled,
    rules_silent: data.rules_silent,
    account_status_enabled: data.account_status_enabled,
    account_status_silent: data.account_status_silent,
    webhook_enabled: data.webhook_enabled,
    webhook_silent: data.webhook_silent,
  };
}

// Checa se essa categoria deve notificar, e se sim, se deve ser silenciosa —
// chamado antes de todo sendPushToAll() do sistema de checagem automática.
export async function notificationDecision(
  category: NotificationCategory,
): Promise<{ enabled: boolean; silent: boolean }> {
  const settings = await getNotificationSettings();
  switch (category) {
    case "deposit":
      return { enabled: settings.deposit_enabled, silent: settings.deposit_silent };
    case "deposit_silence":
      return { enabled: settings.deposit_silence_enabled, silent: settings.deposit_silence_silent };
    case "rules":
      return { enabled: settings.rules_enabled, silent: settings.rules_silent };
    case "account_status":
      return { enabled: settings.account_status_enabled, silent: settings.account_status_silent };
    case "webhook":
      return { enabled: settings.webhook_enabled, silent: settings.webhook_silent };
  }
}

function generateWebhookToken(): string {
  return randomBytes(24).toString("hex");
}

// Token do webhook genérico de notificação (ver /api/webhooks/notify/[token])
// — funciona como a "senha" da URL: qualquer serviço externo que souber
// esse token consegue criar notificação aqui. Gerado sob demanda na
// primeira vez que a aba de notificações é aberta, não na migration.
export async function getOrCreateWebhookToken(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("notification_settings").select("webhook_token").eq("id", 1).maybeSingle();
  if (data?.webhook_token) return data.webhook_token;

  const token = generateWebhookToken();
  await supabase.from("notification_settings").update({ webhook_token: token }).eq("id", 1);
  return token;
}

export async function regenerateWebhookToken(): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const token = generateWebhookToken();
  await supabase.from("notification_settings").update({ webhook_token: token, updated_at: new Date().toISOString() }).eq("id", 1);
  return token;
}

// Valida um token recebido no path do webhook contra o salvo no banco —
// usado pela própria rota pública (sem cookie de sessão), então nunca cria
// token aqui: se ainda não existe nenhum configurado, qualquer chamada é
// recusada.
export async function isValidWebhookToken(token: string): Promise<boolean> {
  if (!token) return false;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("notification_settings").select("webhook_token").eq("id", 1).maybeSingle();
  return Boolean(data?.webhook_token) && data!.webhook_token === token;
}
