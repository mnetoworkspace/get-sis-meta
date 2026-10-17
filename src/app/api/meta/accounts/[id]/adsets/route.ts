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
  const url = new URL(request.url);
  const campaignIdsParam = url.searchParams.get("campaignIds");
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(",").filter(Boolean) : [];
  const since = url.searchParams.get("since") || todayISO();
  const until = url.searchParams.get("until") || todayISO();

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const [adsets, insights] = await Promise.all([
      campaignIds.length > 0
        ? Promise.all(campaignIds.map((id) => fetchAdSetsForCampaign(id, token))).then((lists) => lists.flat())
        : fetchAdSetsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "adset", since, until),
    ]);

    const insightById = new Map<string, { spend: number; purchases: number }>();
    for (const row of insights) {
      if (!row.adset_id) continue;
      const agg = insightById.get(row.adset_id) ?? { spend: 0, purchases: 0 };
      agg.spend += Number(row.spend ?? 0);
      agg.purchases += actionCount(row.actions, "purchase");
      insightById.set(row.adset_id, agg);
    }

    const data = adsets.map((a) => {
      const agg = insightById.get(a.id);
      return {
        ...a,
        campaign_name: a.campaign?.name ?? null,
        spend: agg?.spend ?? 0,
        purchases: agg?.purchases ?? 0,
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
