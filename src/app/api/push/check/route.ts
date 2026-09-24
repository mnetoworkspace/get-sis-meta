import { NextResponse } from "next/server";
import { isPushSubscribed } from "@/lib/push/subscription";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint é obrigatório" }, { status: 400 });
  }

  const subscribed = await isPushSubscribed(endpoint);
  return NextResponse.json({ subscribed });
}
