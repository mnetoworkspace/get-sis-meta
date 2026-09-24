import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.from("fx_rates").select("base_currency, quote_currency, rate, fetched_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
