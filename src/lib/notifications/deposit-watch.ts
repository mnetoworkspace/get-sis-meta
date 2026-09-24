import { fetchAllDeposits, type DepositRow } from "@/lib/payments";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendPushToAll } from "@/lib/push/send";

const SILENCE_MINUTES = Number(process.env.DEPOSIT_SILENCE_MINUTES || 60);
// Cobre bem mais que o intervalo de checagem, pra não perder um depósito se
// o agendador atrasar ou o container reiniciar entre uma checagem e outra.
const LOOKBACK_HOURS = 6;

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Só considera depósito "real" o que a própria API marca como concluído e
// não é usuário de teste — mesmo critério usado no resto do painel
// (ver /api/deposits/summary).
function isRealDeposit(d: DepositRow): boolean {
  return d.status === "COMPLETED" && !d.test_user;
}

async function notifyNewDeposits(deposits: DepositRow[], isBootstrap: boolean): Promise<void> {
  const supabase = createSupabaseAdminClient();

  for (const d of deposits) {
    const { error } = await supabase.from("notifications").insert({
      type: "deposit",
      title: "Novo depósito",
      body: `${formatCurrency(d.amount, d.currency)} via ${d.payment_method_name || d.payment_method}`,
      metadata: { deposit_id: d.id, amount: d.amount, currency: d.currency },
      dedupe_key: `DEPOSIT:${d.id}`,
    });

    if (error) {
      if (!isUniqueViolation(error)) {
        console.error("[deposit-watch] falha ao registrar notificação de depósito:", error);
      }
      continue;
    }

    // Na primeira checagem depois de ativar (sem histórico de notificações),
    // só registra o que já existe pra dedupe — não dispara um push por cada
    // depósito das últimas horas de uma vez.
    if (isBootstrap) continue;

    await sendPushToAll({
      title: "💰 Novo depósito",
      body: `${formatCurrency(d.amount, d.currency)} via ${d.payment_method_name || d.payment_method}`,
      url: "/",
    });
  }
}

async function checkSilence(mostRecentKnownDepositAt: string | null): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const now = Date.now();

  let referenceTime: Date;
  if (mostRecentKnownDepositAt) {
    referenceTime = new Date(mostRecentKnownDepositAt);
  } else {
    const { data: lastRow } = await supabase
      .from("deposits")
      .select("created_at")
      .eq("status", "COMPLETED")
      .eq("test_user", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastRow) return; // Sem nenhum depósito conhecido ainda — nada a comparar.
    referenceTime = new Date(lastRow.created_at);
  }

  const silentMinutes = Math.floor((now - referenceTime.getTime()) / 60000);
  if (silentMinutes < SILENCE_MINUTES) return;

  // Reforça o alerta a cada hora de silêncio (1h, 2h, 3h...) até cair um
  // depósito novo — é um sinal de possível problema no gateway de pagamento,
  // então vale insistir em vez de avisar só uma vez.
  const hourBucket = Math.floor(silentMinutes / 60);
  const dedupeKey = `DEPOSIT_SILENCE:${referenceTime.toISOString()}:${hourBucket}h`;

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

  await sendPushToAll({
    title: "⚠️ Sem depósitos",
    body: `Nenhum depósito há ${silentMinutes} min. Verifique o gateway de pagamento.`,
    url: "/",
  });
}

export async function checkDeposits(): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", "deposit");
  const isBootstrap = (count ?? 0) === 0;

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

  await notifyNewDeposits(real, isBootstrap);

  const mostRecent = real.reduce<string | null>(
    (max, d) => (max === null || d.created_at > max ? d.created_at : max),
    null,
  );
  await checkSilence(mostRecent);
}
