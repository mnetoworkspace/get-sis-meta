import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("ad_accounts")
    .select("*, business_managers(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, bm_id, name, currency, status } = body;

  if (!id || !bm_id || !name) {
    return NextResponse.json(
      { error: "id, bm_id e name são obrigatórios" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("ad_accounts").upsert(
    {
      id: id.startsWith("act_") ? id : `act_${id}`,
      bm_id,
      name,
      currency: currency || null,
      status: status || null,
    },
    { onConflict: "id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
