import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Visão dedicada pro painel de status (BM + contas) — separado de
// /api/bms (que é usado pelo CRUD de gerenciar BMs/contas) pra não mexer
// no formato que o AdminPanel já espera.
export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("business_managers")
    .select(
      "id, name, is_active, meta_status, meta_status_detail, status_checked_at, ad_accounts(id, name, status, is_active, currency)",
    )
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
