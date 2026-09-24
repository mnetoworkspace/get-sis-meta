import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  MetaApiError,
  fetchClientAdAccounts,
  fetchOwnedAdAccounts,
} from "@/lib/meta";
import type { MetaCredential } from "@/types/db";

export const dynamic = "force-dynamic";

const ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

export async function POST(request: Request) {
  const body = await request.json();
  const { bm_id } = body;

  if (!bm_id) {
    return NextResponse.json({ error: "bm_id é obrigatório" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: credential, error: credError } = await supabase
    .from("meta_credentials")
    .select("*")
    .eq("bm_id", bm_id)
    .single<MetaCredential>();

  if (credError || !credential) {
    return NextResponse.json(
      { error: "Nenhuma credencial encontrada para este BM" },
      { status: 404 },
    );
  }

  try {
    const [owned, client] = await Promise.all([
      fetchOwnedAdAccounts(bm_id, credential.system_user_token).catch(
        () => [],
      ),
      fetchClientAdAccounts(bm_id, credential.system_user_token).catch(
        () => [],
      ),
    ]);

    const merged = new Map<string, (typeof owned)[number]>();
    for (const acc of [...owned, ...client]) merged.set(acc.id, acc);

    if (merged.size === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhuma conta de anúncio encontrada para este BM/token. Verifique se o System User tem acesso às contas.",
        },
        { status: 404 },
      );
    }

    const rows = Array.from(merged.values()).map((acc) => ({
      id: acc.id,
      bm_id,
      name: acc.name,
      currency: acc.currency,
      status: ACCOUNT_STATUS_MAP[acc.account_status] || String(acc.account_status),
    }));

    const { error: upsertError } = await supabase
      .from("ad_accounts")
      .upsert(rows, { onConflict: "id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, imported: rows.length, accounts: rows });
  } catch (err) {
    const message =
      err instanceof MetaApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
