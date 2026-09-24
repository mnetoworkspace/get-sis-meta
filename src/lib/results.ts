import type { MetaAction } from "@/lib/meta";

// A Meta não devolve um único "resultado" pronto via Insights API — isso
// depende do objetivo da campanha/conjunto (lead, compra, conversa, etc.).
// Aproximamos o que o Ads Manager mostra na coluna "Resultado" escolhendo,
// em ordem de prioridade, o primeiro action_type relevante presente em
// `actions`. É uma heurística, não uma leitura oficial do optimization_goal.
const RESULT_PRIORITY: { types: string[]; label: string }[] = [
  { types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"], label: "Lead" },
  {
    types: [
      "purchase",
      "omni_purchase",
      "onsite_conversion.purchase",
      "offsite_conversion.fb_pixel_purchase",
    ],
    label: "Compra",
  },
  {
    types: [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
    ],
    label: "Conversa",
  },
  {
    types: ["complete_registration", "onsite_conversion.complete_registration"],
    label: "Cadastro",
  },
  { types: ["landing_page_view"], label: "Visualização da página" },
  { types: ["link_click"], label: "Clique no link" },
];

export interface ResultSummary {
  results: number | null;
  resultType: string | null;
  costPerResult: number | null;
}

export function pickResult(
  actions: MetaAction[] | undefined,
  costPerActionType: MetaAction[] | undefined,
  spend: number,
): ResultSummary {
  if (!actions || actions.length === 0) {
    return { results: null, resultType: null, costPerResult: null };
  }

  for (const candidate of RESULT_PRIORITY) {
    const match = actions.find((a) => candidate.types.includes(a.action_type));
    if (match) {
      const results = Number(match.value) || 0;
      const costEntry = costPerActionType?.find((c) => candidate.types.includes(c.action_type));
      const costPerResult = costEntry ? Number(costEntry.value) || 0 : results > 0 ? spend / results : null;
      return { results, resultType: candidate.label, costPerResult };
    }
  }

  return { results: null, resultType: null, costPerResult: null };
}
