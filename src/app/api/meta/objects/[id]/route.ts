import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { deleteObject, MetaApiError } from "@/lib/meta";

export const dynamic = "force-dynamic";

// Funciona pra campanha, conjunto ou anúncio — mesmo node de delete nos
// três casos, o front manda o ID certo. Irreversível: a Meta não deixa
// reativar um objeto excluído, só duplicar pra criar um novo.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: objectId } = await params;
  const body = await request.json().catch(() => ({}));
  const { accountId } = body as { accountId?: string };

  if (!accountId) {
    return NextResponse.json({ error: "accountId é obrigatório" }, { status: 400 });
  }

  const token = await resolveAccountToken(accountId);
  if (!token) {
    return NextResponse.json({ error: "conta não encontrada ou sem credencial de BM" }, { status: 404 });
  }

  try {
    await deleteObject(objectId, token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
