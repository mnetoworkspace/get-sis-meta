import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { actionCount, fetchCampaignsForAccount, fetchObjectDailyInsights, MetaApiError } from "@/lib/meta";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;
  const url = new URL(request.url);
  const since = url.searchParams.get("since") || todayISO();
  const until = url.searchParams.get("until") || todayISO();

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const [campaigns, insights] = await Promise.all([
      fetchCampaignsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "campaign", since, until),
    ]);

    // Em período de mais de 1 dia, fetchObjectDailyInsights volta uma linha
    // por dia — precisa somar antes de juntar com a campanha.
    const insightById = new Map<string, { spend: number; purchases: number }>();
    for (const row of insights) {
      const agg = insightById.get(row.campaign_id) ?? { spend: 0, purchases: 0 };
      agg.spend += Number(row.spend ?? 0);
      agg.purchases += actionCount(row.actions, "purchase");
      insightById.set(row.campaign_id, agg);
    }

    const data = campaigns.map((c) => {
      const agg = insightById.get(c.id);
      return {
        ...c,
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
