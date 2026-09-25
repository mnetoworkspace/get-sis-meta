import { NextResponse } from "next/server";
import { runAutomationRules } from "@/lib/automation/rules-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Dispara a checagem de regras na hora, sem esperar o próximo ciclo do
// agendador automático (instrumentation.ts) — usado pelo botão "Checar
// agora" da tela de Regras.
export async function POST() {
  try {
    const summary = await runAutomationRules();
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
