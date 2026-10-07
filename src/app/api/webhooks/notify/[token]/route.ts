import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isValidWebhookToken, notificationDecision } from "@/lib/notifications/settings";
import { sendPushToAll } from "@/lib/push/send";

export const dynamic = "force-dynamic";

function pickString(body: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

// Webhook genérico de notificação — igual o que serviços tipo Pushcut
// oferecem: qualquer sistema externo que souber a URL completa (com o
// token) pode chamar aqui e a notificação cai no app (+ push), sem
// precisar de login. A segurança é só o token no path, por isso ele tem
// que ser tratado como senha — nunca compartilhado fora do que vai chamar
// esse endpoint.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const valid = await isValidWebhookToken(token);
  if (!valid) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  const raw = await request.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    // corpo não é JSON — trata o texto cru como a mensagem da notificação
    // (cobre quem manda "Content-Type: text/plain" ou form simples)
    if (raw.trim()) body = { text: raw.trim() };
  }

  const explicitTitle = pickString(body, ["title"]);
  const message = pickString(body, ["text", "body", "message"]);

  if (!explicitTitle && !message) {
    return NextResponse.json({ error: "informe 'title' ou 'text'/'body'/'message' no corpo" }, { status: 400 });
  }

  // Sem title explícito, a mensagem vira o título (negrito) sem corpo —
  // mesma lógica do push de depósito: o nome do app já aparece sozinho
  // acima da notificação no iOS, então um "title" genérico repetiria isso.
  const notifTitle = explicitTitle ?? message!;
  const notifBody = explicitTitle ? (message ?? null) : null;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("notifications").insert({
    type: "webhook",
    title: notifTitle,
    body: notifBody,
    metadata: { source: "webhook", raw: body },
    dedupe_key: `WEBHOOK:${randomUUID()}`,
  });

  if (error) {
    console.error("[webhook-notify] falha ao registrar notificação:", error);
    return NextResponse.json({ error: "falha ao registrar notificação" }, { status: 500 });
  }

  const { enabled, silent } = await notificationDecision("webhook");
  if (enabled) {
    await sendPushToAll({ title: notifTitle, body: notifBody ?? undefined, url: "/", silent });
  }

  return NextResponse.json({ ok: true });
}
