// Cliente para a API interna de pagamentos da Rakebet (depósitos).
// Endpoint aberto (sem token) — https://api-payments.rakebet.io
const PAYMENTS_BASE = process.env.PAYMENTS_API_BASE || "https://api-payments.rakebet.io";

export class PaymentsApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PaymentsApiError";
  }
}

export interface DepositRow {
  id: string;
  player_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_method_name: string;
  gateway: string;
  created_at: string;
  processed_at: string | null;
  test_user: boolean;
}

interface DepositsResponse {
  page: number;
  pages: number;
  limit: number;
  data: DepositRow[];
}

// Busca todas as páginas de depósitos no período. Não inclui dados pessoais
// (nome/email/telefone) no retorno usado pelo resto do app — só o necessário
// pra agregações e detecção de FTD.
export async function fetchAllDeposits(from: string, to: string): Promise<DepositRow[]> {
  const limit = 200;
  let page = 1;
  const all: DepositRow[] = [];

  while (true) {
    const url = new URL(`${PAYMENTS_BASE}/deposits`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new PaymentsApiError(`Erro ao chamar API de pagamentos (${res.status})`, res.status);
    }

    const json: DepositsResponse = await res.json();
    all.push(...json.data);

    if (page >= json.pages || json.data.length === 0) break;
    page += 1;
  }

  return all;
}
