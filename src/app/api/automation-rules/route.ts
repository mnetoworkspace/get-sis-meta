import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("automation_rules")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, threshold, time_window, bm_ids, is_active } = body;

  if (!name || threshold == null || Number(threshold) <= 0) {
    return NextResponse.json({ error: "name e threshold (> 0) são obrigatórios" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("automation_rules").insert({
    name,
    scope: "adset",
    metric: "spend",
    threshold: Number(threshold),
    condition: "no_ftd",
    time_window: time_window === "lifetime" ? "lifetime" : "today",
    action: "pause",
    bm_ids: Array.isArray(bm_ids) ? bm_ids : [],
    is_active: is_active !== false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
