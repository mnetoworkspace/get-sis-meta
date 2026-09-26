import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SCOPES = new Set(["campaign", "adset", "ad"]);
const ACTIONS = new Set(["pause", "activate", "increase_budget", "decrease_budget", "duplicate", "delete_rejected"]);
const BUDGET_ACTIONS = new Set(["increase_budget", "decrease_budget"]);
const BUDGET_TYPES = new Set(["fixed", "percentage"]);
const DUPLICATE_WINDOWS = new Set(["minute", "hour", "day"]);

export async function PATCH(request: Request, { params }: RouteContext<"/api/automation-rules/[id]">) {
  const { id } = await params;
  const body = await request.json();
  const {
    name,
    scope,
    action,
    time_window,
    bm_ids,
    is_active,
    rules,
    budget_adjustment_type,
    budget_adjustment_value,
    duplicate_limit_count,
    duplicate_limit_window,
  } = body;

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (scope !== undefined && SCOPES.has(scope)) update.scope = scope;
  if (action !== undefined && ACTIONS.has(action)) {
    update.action = action;
    if (BUDGET_ACTIONS.has(action)) {
      if (!BUDGET_TYPES.has(budget_adjustment_type) || Number(budget_adjustment_value) <= 0) {
        return NextResponse.json(
          { error: "informe o tipo (R$ ou %) e um valor de ajuste de orçamento maior que zero" },
          { status: 400 },
        );
      }
      update.budget_adjustment_type = budget_adjustment_type;
      update.budget_adjustment_value = Number(budget_adjustment_value);
    } else {
      update.budget_adjustment_type = null;
      update.budget_adjustment_value = null;
    }

    if (action === "duplicate") {
      const finalScope = scope !== undefined && SCOPES.has(scope) ? scope : undefined;
      if (finalScope !== "adset") {
        return NextResponse.json({ error: "duplicar só é suportado no nível conjunto de anúncios" }, { status: 400 });
      }
      if (!Number.isFinite(Number(duplicate_limit_count)) || Number(duplicate_limit_count) <= 0) {
        return NextResponse.json({ error: "informe um limite de duplicações maior que zero" }, { status: 400 });
      }
      if (!DUPLICATE_WINDOWS.has(duplicate_limit_window)) {
        return NextResponse.json({ error: "informe a janela do limite (minuto, hora ou dia)" }, { status: 400 });
      }
      update.duplicate_limit_count = Number(duplicate_limit_count);
      update.duplicate_limit_window = duplicate_limit_window;
    } else {
      update.duplicate_limit_count = null;
      update.duplicate_limit_window = null;
    }

    if (action === "delete_rejected") {
      const finalScope = scope !== undefined && SCOPES.has(scope) ? scope : undefined;
      if (finalScope !== "ad") {
        return NextResponse.json({ error: "excluir rejeitado só é suportado no nível anúncio" }, { status: 400 });
      }
      update.rules = { operator: "AND", conditions: [] };
    }
  }
  if (time_window !== undefined) update.time_window = time_window === "lifetime" ? "lifetime" : "today";
  if (bm_ids !== undefined) update.bm_ids = Array.isArray(bm_ids) ? bm_ids : [];
  if (is_active !== undefined) update.is_active = Boolean(is_active);
  if (rules !== undefined && update.rules === undefined) update.rules = rules;
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
