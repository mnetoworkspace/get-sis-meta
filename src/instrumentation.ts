// Roda uma vez quando o servidor Next.js sobe (container fixo no EasyPanel,
// não serverless) e mantém um setInterval checando depósitos novos/silêncio.
// Ver src/lib/notifications/deposit-watch.ts para a lógica de detecção.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __depositWatchStarted?: boolean };
  if (g.__depositWatchStarted) return;
  g.__depositWatchStarted = true;

  const { checkDeposits } = await import("@/lib/notifications/deposit-watch");
  const intervalMinutes = Number(process.env.DEPOSIT_CHECK_INTERVAL_MINUTES || 5);

  function run() {
    checkDeposits().catch((err) => console.error("[deposit-watch] erro na checagem:", err));
  }

  run();
  setInterval(run, intervalMinutes * 60 * 1000);
}
