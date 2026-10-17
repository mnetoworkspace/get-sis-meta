import { NextResponse } from "next/server";
import { resolveAccountToken } from "@/lib/meta-account";
import { duplicateAdSet, MetaApiError } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: adsetId } = await params;
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
    const result = await duplicateAdSet(adsetId, accountId, token);
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
