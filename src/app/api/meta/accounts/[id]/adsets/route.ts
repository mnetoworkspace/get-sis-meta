import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import {
  actionCount,
  fetchAdSetsForAccount,
  fetchAdSetsForCampaign,
  fetchObjectDailyInsights,
  MetaApiError,
} from "@/lib/meta";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

// Sem "campaignIds" na query, traz TODOS os conjuntos da conta — igual o
// Ads Manager mostra tudo quando nenhuma campanha tá marcada. Com
// "campaignIds" (csv), traz só os conjuntos dessas campanhas — é o que
// acontece quando a pessoa marca o checkbox de uma ou mais campanhas no
// nível anterior e navega pro nível "Conjuntos de anúncio".
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const campaignIdsParam = new URL(request.url).searchParams.get("campaignIds");
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(",").filter(Boolean) : [];

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const today = todayISO();
    const [adsets, insights] = await Promise.all([
      campaignIds.length > 0
        ? Promise.all(campaignIds.map((id) => fetchAdSetsForCampaign(id, token))).then((lists) => lists.flat())
        : fetchAdSetsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "adset", today, today),
    ]);

    const insightByAdSet = new Map(insights.map((row) => [row.adset_id, row]));

    const data = adsets.map((a) => {
      const insight = insightByAdSet.get(a.id);
      return {
        ...a,
        spend_today: Number(insight?.spend ?? 0),
        purchases_today: actionCount(insight?.actions, "purchase"),
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
