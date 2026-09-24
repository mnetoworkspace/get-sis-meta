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
  const { id, name, system_user_token, app_id, app_secret, label, is_edit } = body;

  if (!id || !name) {
    return NextResponse.json({ error: "id e name são obrigatórios" }, { status: 400 });
  }

  if (!is_edit && !system_user_token) {
    return NextResponse.json({ error: "system_user_token é obrigatório" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { error: bmError } = await supabase
    .from("business_managers")
    .upsert({ id, name }, { onConflict: "id" });

  if (bmError) {
    return NextResponse.json({ error: bmError.message }, { status: 500 });
  }

  // Em edição, deixar o token em branco mantém a credencial atual.
  if (system_user_token || app_id || app_secret || label) {
    const { data: existing } = await supabase
      .from("meta_credentials")
      .select("system_user_token")
      .eq("bm_id", id)
      .maybeSingle();

    const token = system_user_token || existing?.system_user_token;
    if (!token) {
      return NextResponse.json({ error: "system_user_token é obrigatório" }, { status: 400 });
    }

    const { error: credError } = await supabase.from("meta_credentials").upsert(
      {
        bm_id: id,
        system_user_token: token,
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
  }

  return NextResponse.json({ ok: true });
}
