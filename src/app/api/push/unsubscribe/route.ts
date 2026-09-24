import { NextResponse } from "next/server";
import { removePushSubscription } from "@/lib/push/subscription";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint é obrigatório" }, { status: 400 });
  }

  try {
    await removePushSubscription(endpoint);
    // Login único compartilhado: não há "outros clientes" com escopo próprio
    // pra preservar — sempre pode desfazer a inscrição no navegador também.
    return NextResponse.json({ ok: true, otherClientsRemain: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
