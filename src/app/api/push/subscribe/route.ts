import { NextResponse } from "next/server";
import { savePushSubscription } from "@/lib/push/subscription";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Inscrição de push inválida" }, { status: 400 });
  }

  try {
    await savePushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
