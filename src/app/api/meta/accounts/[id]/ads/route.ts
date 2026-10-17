import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { actionCount, fetchAdsForAccount, fetchAdsForAdSet, fetchObjectDailyInsights, MetaApiError } from "@/lib/meta";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mesma lógica de .../adsets: sem "adsetIds" traz todos os anúncios da
// conta, com "adsetIds" (csv) traz só os anúncios desses conjuntos.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const url = new URL(request.url);
  const adsetIdsParam = url.searchParams.get("adsetIds");
  const adsetIds = adsetIdsParam ? adsetIdsParam.split(",").filter(Boolean) : [];
  const since = url.searchParams.get("since") || todayISO();
  const until = url.searchParams.get("until") || todayISO();

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const [ads, insights] = await Promise.all([
      adsetIds.length > 0
        ? Promise.all(adsetIds.map((id) => fetchAdsForAdSet(id, token))).then((lists) => lists.flat())
        : fetchAdsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "ad", since, until),
    ]);

    const insightById = new Map<string, { spend: number; purchases: number }>();
    for (const row of insights) {
      if (!row.ad_id) continue;
      const agg = insightById.get(row.ad_id) ?? { spend: 0, purchases: 0 };
      agg.spend += Number(row.spend ?? 0);
      agg.purchases += actionCount(row.actions, "purchase");
      insightById.set(row.ad_id, agg);
    }

    const data = ads.map((a) => {
      const agg = insightById.get(a.id);
      return {
        ...a,
        adset_name: a.adset?.name ?? null,
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
