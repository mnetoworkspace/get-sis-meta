import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const adAccountId = searchParams.get("ad_account_id");

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("insights_account_daily")
    .select("*, ad_accounts(name, currency, bm_id, business_managers(name))")
    .order("date", { ascending: false });

  if (since) query = query.gte("date", since);
  if (until) query = query.lte("date", until);
  if (adAccountId) query = query.eq("ad_account_id", adAccountId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
