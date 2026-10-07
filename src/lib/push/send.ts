import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  // Web Push não permite escolher um som customizado pra notificação do
  // SISTEMA — só tocar o som padrão do aparelho (silent: false/omitido)
  // ou não tocar nada (silent: true). Repassado pro service worker via
  // public/sw.js.
  silent?: boolean;
  // Categoria da notificação (ex: "deposit") — o service worker repassa
  // isso pra página via postMessage, que usa pra decidir se toca o som
  // customizado (public/sounds/deposit.mp3). Isso só funciona com o app
  // aberto; é diferente do "silent" acima, que é sobre a notificação do
  // sistema operacional.
  type?: string;
}

// Manda a mesma notificação pra todos os dispositivos inscritos (login único
// compartilhado — não há escopo por usuário).
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const supabase = createSupabaseAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error || !subscriptions || subscriptions.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Inscrição expirada/revogada pelo navegador — remove do banco.
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] falha ao enviar notificação:", err);
        }
      }
    }),
  );
}
