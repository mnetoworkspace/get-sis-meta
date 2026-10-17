import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { actionCount, fetchAdsForAccount, fetchAdsForAdSet, fetchObjectDailyInsights, MetaApiError } from "@/lib/meta";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

// Mesma lógica de .../adsets: sem "adsetIds" traz todos os anúncios da
// conta, com "adsetIds" (csv) traz só os anúncios desses conjuntos.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const adsetIdsParam = new URL(request.url).searchParams.get("adsetIds");
  const adsetIds = adsetIdsParam ? adsetIdsParam.split(",").filter(Boolean) : [];

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const today = todayISO();
    const [ads, insights] = await Promise.all([
      adsetIds.length > 0
        ? Promise.all(adsetIds.map((id) => fetchAdsForAdSet(id, token))).then((lists) => lists.flat())
        : fetchAdsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "ad", today, today),
    ]);

    const insightByAd = new Map(insights.map((row) => [row.ad_id, row]));

    const data = ads.map((a) => {
      const insight = insightByAd.get(a.id);
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
