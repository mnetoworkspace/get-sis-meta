import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const adAccountId = searchParams.get("ad_account_id");
  const adAccountIds = searchParams.get("ad_account_ids")?.split(",").filter(Boolean) ?? [];
  const campaignId = searchParams.get("campaign_id");
  const limit = Number(searchParams.get("limit") || "1000");

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("insights_ad_daily")
    .select("*, ad_accounts(name, currency, bm_id)")
    .order("date", { ascending: false })
    .limit(Math.min(limit, 5000));

  if (since) query = query.gte("date", since);
  if (until) query = query.lte("date", until);
  if (adAccountIds.length > 0) query = query.in("ad_account_id", adAccountIds);
  else if (adAccountId) query = query.eq("ad_account_id", adAccountId);
  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
