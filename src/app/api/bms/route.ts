import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data: bms, error } = await supabase
    .from("business_managers")
    .select("*, meta_credentials(id, label, app_id, updated_at), ad_accounts(id)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Nunca retorna o token para o client.
  return NextResponse.json({ data: bms });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, name, system_user_token, app_id, app_secret, label } = body;

  if (!id || !name || !system_user_token) {
    return NextResponse.json(
      { error: "id, name e system_user_token são obrigatórios" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { error: bmError } = await supabase
    .from("business_managers")
    .upsert({ id, name }, { onConflict: "id" });

  if (bmError) {
    return NextResponse.json({ error: bmError.message }, { status: 500 });
  }

  const { error: credError } = await supabase.from("meta_credentials").upsert(
    {
      bm_id: id,
      system_user_token,
      app_id: app_id || null,
      app_secret: app_secret || null,
      label: label || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bm_id" },
  );

  if (credError) {
    return NextResponse.json({ error: credError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
