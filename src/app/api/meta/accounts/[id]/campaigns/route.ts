import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { actionCount, fetchCampaignsForAccount, fetchObjectDailyInsights, MetaApiError } from "@/lib/meta";
import { todayISO } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: accountId } = await params;

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    const today = todayISO();
    const [campaigns, insights] = await Promise.all([
      fetchCampaignsForAccount(accountId, token),
      fetchObjectDailyInsights(accountId, token, "campaign", today, today),
    ]);

    const insightByCampaign = new Map(insights.map((row) => [row.campaign_id, row]));

    const data = campaigns.map((c) => {
      const insight = insightByCampaign.get(c.id);
      return {
        ...c,
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
