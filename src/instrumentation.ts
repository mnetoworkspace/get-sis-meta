// Roda uma vez quando o servidor Next.js sobe (container fixo no EasyPanel,
// não serverless) e mantém um setInterval checando depósitos novos/silêncio,
// regras de automação de conjuntos de anúncio e status das contas de anúncio.
// Ver src/lib/notifications/deposit-watch.ts, src/lib/automation/rules-engine.ts
// e src/lib/notifications/account-status-watch.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __backgroundChecksStarted?: boolean };
  if (g.__backgroundChecksStarted) return;
  g.__backgroundChecksStarted = true;

  const { checkDeposits } = await import("@/lib/notifications/deposit-watch");
  const { runAutomationRules } = await import("@/lib/automation/rules-engine");
  const { checkAccountStatus } = await import("@/lib/notifications/account-status-watch");
  const intervalMinutes = Number(process.env.DEPOSIT_CHECK_INTERVAL_MINUTES || 5);

  function run() {
    checkDeposits().catch((err) => console.error("[deposit-watch] erro na checagem:", err));
    runAutomationRules().catch((err) => console.error("[rules-engine] erro na checagem:", err));
    checkAccountStatus().catch((err) => console.error("[account-status-watch] erro na checagem:", err));
  }

  run();
  setInterval(run, intervalMinutes * 60 * 1000);
}
