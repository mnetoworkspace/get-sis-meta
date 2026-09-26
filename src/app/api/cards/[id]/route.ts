import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: RouteContext<"/api/cards/[id]">) {
  const { id } = await params;
  const body = await request.json();
  const { low_balance_threshold } = body;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (low_balance_threshold !== undefined) {
    update.low_balance_threshold_cents =
      low_balance_threshold === null || low_balance_threshold === "" ? null : Math.round(Number(low_balance_threshold) * 100);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("cards").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/cards/[id]">) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("cards").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
