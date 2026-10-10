import { fetchAllDeposits, type DepositRow } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendPushToAll } from "@/lib/push/send";
import { notificationDecision } from "@/lib/notifications/settings";

const SILENCE_MINUTES = Number(process.env.DEPOSIT_SILENCE_MINUTES || 60);
// Cobre bem mais que o intervalo de checagem, pra não perder um depósito se
// o agendador atrasar ou o container reiniciar entre uma checagem e outra.
const LOOKBACK_HOURS = 6;

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Só considera depósito "real" o que a própria API marca como concluído e
// não é usuário de teste — mesmo critério usado no resto do painel
// (ver /api/deposits/summary).
function isRealDeposit(d: DepositRow): boolean {
  return d.status === "COMPLETED" && !d.test_user;
}

const DEPOSIT_WEBHOOK_PATTERN = /dep[oó]sito/i;

// O webhook em tempo real (ver /api/webhooks/notify/[token]) hoje é o canal
// mais rápido pra saber que caiu depósito — mais rápido que o polling da API
// antiga, que só roda a cada DEPOSIT_CHECK_INTERVAL_MINUTES. Sem olhar pra
// ele aqui, o alerta de silêncio dispara falso positivo (API atrasada)
// mesmo com depósito reconhecido chegando certinho pelo webhook.
async function latestWebhookDepositAt(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<string | null> {
  const { data } = await supabase
    .from("notifications")
    .select("created_at, title, body")
    .eq("type", "webhook")
    .order("created_at", { ascending: false })
    .limit(20);

  const match = (data || []).find(
    (row) => DEPOSIT_WEBHOOK_PATTERN.test(row.title ?? "") || DEPOSIT_WEBHOOK_PATTERN.test(row.body ?? ""),
  );
  return match?.created_at ?? null;
}

async function checkSilence(mostRecentKnownDepositAt: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const now = Date.now();

  const candidates: Date[] = [];
  if (mostRecentKnownDepositAt) candidates.push(new Date(mostRecentKnownDepositAt));

  const webhookAt = await latestWebhookDepositAt(supabase);
  if (webhookAt) candidates.push(new Date(webhookAt));

  if (candidates.length === 0) {
    const { data: lastRow } = await supabase
      .from("deposits")
      .select("created_at")
      .eq("status", "COMPLETED")
      .eq("test_user", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastRow) return; // Sem nenhum depósito conhecido ainda — nada a comparar.
    candidates.push(new Date(lastRow.created_at));
  }

  const referenceTime = candidates.reduce((latest, d) => (d > latest ? d : latest));

  const silentMinutes = Math.floor((now - referenceTime.getTime()) / 60000);
  if (silentMinutes < SILENCE_MINUTES) return;

  // Reforça o alerta a cada hora de silêncio (1h, 2h, 3h...) até cair um
  // depósito novo — é um sinal de possível problema no gateway de pagamento,
  // então vale insistir em vez de avisar só uma vez.
  const hourBucket = Math.floor(silentMinutes / 60);
  const dedupeKey = `DEPOSIT_SILENCE:${referenceTime.toISOString()}:${hourBucket}h`;

  const { enabled: pushEnabled, silent } = await notificationDecision("deposit_silence");

  const { error } = await supabase.from("notifications").insert({
    type: "deposit_silence",
    title: "Sem depósitos há um tempo",
    body: `Nenhum depósito registrado há ${silentMinutes} min. Possível problema no gateway de pagamento.`,
    metadata: { silent_minutes: silentMinutes, last_deposit_at: referenceTime.toISOString() },
    dedupe_key: dedupeKey,
  });

  if (error) {
    if (!isUniqueViolation(error)) {
      console.error("[deposit-watch] falha ao registrar alerta de silêncio:", error);
    }
    return;
  }

  if (!pushEnabled) return;

  await sendPushToAll({
    title: "⚠️ Sem depósitos",
    body: `Nenhum depósito há ${silentMinutes} min. Verifique o gateway de pagamento.`,
    url: "/",
    silent,
  });
}

// Não notifica mais "Novo depósito" por aqui — isso agora é feito em tempo
// real pelo webhook (ver /api/webhooks/notify/[token]), e notificar de novo
// aqui a cada ciclo duplicava o aviso (um pelo webhook, outro minutos depois
// por esse polling). Essa checagem continua rodando só internamente, como
// rede de segurança pro alerta de silêncio (ver checkSilence).
export async function checkDeposits(): Promise<void> {
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  let deposits: DepositRow[];
  try {
    deposits = await fetchAllDeposits(from, now.toISOString());
  } catch (err) {
    console.error("[deposit-watch] falha ao buscar depósitos:", err);
    return;
  }

  const real = deposits.filter(isRealDeposit);

  const mostRecent = real.reduce<string | null>(
    (max, d) => (max === null || d.created_at > max ? d.created_at : max),
    null,
  );
  await checkSilence(mostRecent);
}
