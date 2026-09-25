import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SCOPES = new Set(["campaign", "adset", "ad"]);
const ACTIONS = new Set(["pause", "activate"]);

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
  const { name, scope, action, time_window, bm_ids, is_active, rules } = body;

  if (!name) {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }
  if (!rules || !Array.isArray(rules.conditions) || rules.conditions.length === 0) {
    return NextResponse.json({ error: "é preciso pelo menos uma condição" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("automation_rules").insert({
    name,
    scope: SCOPES.has(scope) ? scope : "adset",
    action: ACTIONS.has(action) ? action : "pause",
    time_window: time_window === "lifetime" ? "lifetime" : "today",
    rules,
    bm_ids: Array.isArray(bm_ids) ? bm_ids : [],
    is_active: is_active !== false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
