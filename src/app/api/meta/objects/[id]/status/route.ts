import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { setObjectStatus, MetaApiError } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Funciona pra campanha, conjunto ou anúncio — mesmo node de status na Meta
// nos três casos, o front manda o ID certo de acordo com o que clicou.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: objectId } = await params;
  const body = await request.json().catch(() => ({}));
  const { accountId, status } = body as { accountId?: string; status?: string };

  if (!accountId || (status !== "ACTIVE" && status !== "PAUSED")) {
    return NextResponse.json({ error: "accountId e status ('ACTIVE' ou 'PAUSED') são obrigatórios" }, { status: 400 });
  }

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    await setObjectStatus(objectId, status, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
