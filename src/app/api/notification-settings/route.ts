import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { getNotificationSettings, getOrCreateWebhookToken, regenerateWebhookToken } from "@/lib/notifications/settings";

export const dynamic = "force-dynamic";

// request.url reflete o host interno que o Node recebeu a conexão (ex:
// "0.0.0.0:80" dentro do container do EasyPanel), não o domínio público —
// atrás de um reverse proxy isso nunca bate com o endereço real. Os
// headers x-forwarded-* são quem carrega o domínio/proto que o visitante
// de fato usou; sem eles (dev local sem proxy), cai de volta pro
// request.url mesmo, que aí já está certo.
function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

const BOOLEAN_FIELDS = [
  "deposit_enabled",
  "deposit_silent",
  "deposit_silence_enabled",
  "deposit_silence_silent",
  "rules_enabled",
  "rules_silent",
  "account_status_enabled",
  "account_status_silent",
  "webhook_enabled",
  "webhook_silent",
] as const;

export async function GET(request: Request) {
  const [settings, token] = await Promise.all([getNotificationSettings(), getOrCreateWebhookToken()]);
  const webhookUrl = `${getPublicOrigin(request)}/api/webhooks/notify/${token}`;
  return NextResponse.json({ data: settings, webhook_url: webhookUrl });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  // Regenerar o token é uma ação à parte (não um campo booleano) — troca
  // a URL inteira do webhook, invalidando a antiga na hora.
  if (body.regenerate_webhook_token === true) {
    const token = await regenerateWebhookToken();
    const webhookUrl = `${getPublicOrigin(request)}/api/webhooks/notify/${token}`;
    return NextResponse.json({ ok: true, webhook_url: webhookUrl });
  }

  const update: Record<string, boolean> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json({ error: `${field} precisa ser booleano` }, { status: 400 });
      }
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nenhum campo válido para atualizar" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("notification_settings")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
