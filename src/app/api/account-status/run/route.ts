import { NextResponse } from "next/server";
import { checkAccountStatus } from "@/lib/notifications/account-status-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    await checkAccountStatus();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
