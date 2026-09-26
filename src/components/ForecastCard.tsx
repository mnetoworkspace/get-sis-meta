"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatCurrency, todayISO } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Props {
  since: string;
  until: string;
}

interface CurrencyTotals {
  ceiling_cents: number;
  ceiling_lifetime_rateio_cents: number;
  spend_today_cents: number;
  projection_cents: number;
  lifetime_rateio_objects: number;
  lifetime_no_end_date_objects: number;
}

interface ForecastResponse {
  hour: number;
  totals: Record<string, CurrencyTotals>;
  errors: string[];
}

// Só faz sentido "prever o gasto de hoje" quando o período selecionado é
// hoje — em qualquer outro período (ontem, 30 dias...) esse número não
// significa nada, então o card nem aparece.
export function ForecastCard({ since, until }: Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const isToday = since === todayISO() && until === todayISO();

  useEffect(() => {
    if (!isToday) return;
    let cancelled = false;
    fetch("/api/forecast/today")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isToday]);

  if (!isToday) return null;

  const currencies = data ? Object.entries(data.totals) : [];

  return (
    <div className="mb-4 card p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <TrendingUp size={14} className="text-[var(--accent)]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Previsão de gasto hoje
        </p>
        <InfoTooltip>
          Teto = orçamentos diários de campanhas/conjuntos ativos, em contas com pagamento ativo, + um
          rateio do orçamento vitalício (valor total ÷ dias restantes até o fim da campanha — é uma média,
          não um teto real, a Meta pode gastar mais ou menos num dia específico). Campanha vitalícia sem
          data de término não entra em nada disso. Projeção = gasto de hoje + estimativa das horas
          restantes com base no ritmo das últimas horas — também não é garantia.
        </InfoTooltip>
      </div>

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">Calculando...</p>
      ) : currencies.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nenhuma campanha ativa em conta ativa agora.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {currencies.map(([currency, t]) => (
            <div key={currency} className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">Teto orçamentário ({currency})</p>
                <p className="text-lg font-semibold text-[var(--text)]">
                  {formatCurrency(t.ceiling_cents / 100, currency)}
                </p>
                {t.ceiling_lifetime_rateio_cents > 0 && (
                  <p className="text-[10px] text-[var(--text-muted)]">
                    inclui {formatCurrency(t.ceiling_lifetime_rateio_cents / 100, currency)} rateado de vitalício
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">Projeção realista</p>
                <p className="text-lg font-semibold text-[var(--text)]">
                  {formatCurrency(t.projection_cents / 100, currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">Já gasto hoje</p>
                <p className="text-sm text-[var(--text-muted)]">{formatCurrency(t.spend_today_cents / 100, currency)}</p>
              </div>
              {t.lifetime_rateio_objects > 0 && (
                <p className="w-full text-[11px] text-[var(--text-muted)]">
                  {t.lifetime_rateio_objects} campanha(s)/conjunto(s) de orçamento vitalício entram via rateio
                  (valor total ÷ dias restantes).
                </p>
              )}
              {t.lifetime_no_end_date_objects > 0 && (
                <p className="w-full text-[11px] text-[var(--text-muted)]">
                  {t.lifetime_no_end_date_objects} campanha(s)/conjunto(s) de orçamento vitalício sem data de
                  término não entram no teto (não dá pra ratear sem saber até quando).
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {data && data.errors.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--danger)]">
          Falha ao checar {data.errors.length} conta(s) — número pode estar subestimado.
        </p>
      )}
    </div>
  );
}
