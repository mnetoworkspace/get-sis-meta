import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SCOPES = new Set(["campaign", "adset", "ad"]);
const ACTIONS = new Set(["pause", "activate"]);

export async function PATCH(request: Request, { params }: RouteContext<"/api/automation-rules/[id]">) {
  const { id } = await params;
  const body = await request.json();
  const { name, scope, action, time_window, bm_ids, is_active, rules } = body;

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (scope !== undefined && SCOPES.has(scope)) update.scope = scope;
  if (action !== undefined && ACTIONS.has(action)) update.action = action;
  if (time_window !== undefined) update.time_window = time_window === "lifetime" ? "lifetime" : "today";
  if (bm_ids !== undefined) update.bm_ids = Array.isArray(bm_ids) ? bm_ids : [];
  if (is_active !== undefined) update.is_active = Boolean(is_active);
  if (rules !== undefined) update.rules = rules;
  update.updated_at = new Date().toISOString();

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("automation_rules").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/automation-rules/[id]">) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("automation_rules").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
