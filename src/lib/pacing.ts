// Ritmo recente de gasto: média das últimas horas já fechadas (até 3), não
// um histórico de dias — uma campanha recém-ativada ainda não tem gasto
// recente que sustente uma extrapolação alta. Mesma técnica usada tanto na
// previsão de gasto de hoje quanto na previsão de quando o saldo do cartão
// deve zerar, pra manter os dois números coerentes entre si.
export function recentAvgCentsPerHour(rows: { hour: number; spend: number }[], currentHour: number): number {
  if (currentHour <= 0) return 0;
  const recentHours = rows.filter((r) => r.hour >= Math.max(0, currentHour - 3) && r.hour < currentHour);
  const sum = recentHours.reduce((acc, r) => acc + Number(r.spend || 0), 0);
  return Math.round((sum / Math.min(3, currentHour)) * 100);
}
