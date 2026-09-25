// Modelo de condições das regras de automação — inspirado no construtor de
// públicos do tracking-sales-system (grupo de condições com TODAS/QUALQUER),
// só que sem sub-grupos aninhados por enquanto: um nível só é suficiente pro
// caso de uso atual, e o formato já fica pronto pra crescer (novos campos,
// operadores, ou sub-grupos) sem precisar de outra migration de schema.

export type RuleField = "spend" | "ftd" | "cost_per_ftd" | "results" | "cost_per_result";
export type RuleOperator = "gte" | "lte" | "gt" | "lt" | "eq";

export interface RuleCondition {
  id: string;
  field: RuleField;
  operator: RuleOperator;
  value: string;
}

export interface RuleConditionGroup {
  operator: "AND" | "OR";
  conditions: RuleCondition[];
}

export const FIELD_OPTIONS: { value: RuleField; label: string; isCurrency: boolean }[] = [
  { value: "spend", label: "Gasto", isCurrency: true },
  { value: "ftd", label: "FTD (quantidade)", isCurrency: false },
  { value: "cost_per_ftd", label: "Custo por FTD", isCurrency: true },
  { value: "results", label: "Resultados (quantidade)", isCurrency: false },
  { value: "cost_per_result", label: "Custo por resultado", isCurrency: true },
];

export const OPERATOR_OPTIONS: { value: RuleOperator; label: string }[] = [
  { value: "gte", label: "≥ maior ou igual a" },
  { value: "lte", label: "≤ menor ou igual a" },
  { value: "gt", label: "> maior que" },
  { value: "lt", label: "< menor que" },
  { value: "eq", label: "= igual a" },
];

export type RuleAction = "pause" | "activate" | "increase_budget" | "decrease_budget" | "duplicate";
export type BudgetAdjustmentType = "fixed" | "percentage";
export type DuplicateLimitWindow = "minute" | "hour" | "day";

export const ACTION_OPTIONS: { value: RuleAction; label: string }[] = [
  { value: "pause", label: "Pausar" },
  { value: "activate", label: "Ativar" },
  { value: "increase_budget", label: "Aumentar orçamento" },
  { value: "decrease_budget", label: "Diminuir orçamento" },
  { value: "duplicate", label: "Duplicar conjunto de anúncios" },
];

export const DUPLICATE_WINDOW_OPTIONS: { value: DuplicateLimitWindow; label: string }[] = [
  { value: "minute", label: "por minuto" },
  { value: "hour", label: "por hora" },
  { value: "day", label: "por dia" },
];

export function actionLabel(action: RuleAction): string {
  return ACTION_OPTIONS.find((a) => a.value === action)?.label ?? action;
}

export function isBudgetAction(action: RuleAction): boolean {
  return action === "increase_budget" || action === "decrease_budget";
}

export function isDuplicateAction(action: RuleAction): boolean {
  return action === "duplicate";
}

export function fieldLabel(field: RuleField): string {
  return FIELD_OPTIONS.find((f) => f.value === field)?.label ?? field;
}

export function operatorLabel(operator: RuleOperator): string {
  return OPERATOR_OPTIONS.find((o) => o.value === operator)?.label ?? operator;
}

export function emptyCondition(): RuleCondition {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    field: "spend",
    operator: "gte",
    value: "",
  };
}

export function emptyConditionGroup(): RuleConditionGroup {
  return { operator: "AND", conditions: [emptyCondition()] };
}

// Métricas calculadas pro objeto (campanha/conjunto/anúncio) que está sendo
// avaliado nessa checagem — null quando o dado não existe (ex: custo/FTD sem
// nenhum FTD é indefinido, não zero).
export type RuleMetrics = Partial<Record<RuleField, number | null>>;

export function evaluateCondition(condition: RuleCondition, metrics: RuleMetrics): boolean {
  const actual = metrics[condition.field];
  if (actual == null) return false;
  const target = Number(condition.value);
  if (Number.isNaN(target)) return false;
  switch (condition.operator) {
    case "gte":
      return actual >= target;
    case "lte":
      return actual <= target;
    case "gt":
      return actual > target;
    case "lt":
      return actual < target;
    case "eq":
      return actual === target;
    default:
      return false;
  }
}

export function evaluateGroup(group: RuleConditionGroup | null | undefined, metrics: RuleMetrics): boolean {
  if (!group || !group.conditions || group.conditions.length === 0) return false;
  return group.operator === "AND"
    ? group.conditions.every((c) => evaluateCondition(c, metrics))
    : group.conditions.some((c) => evaluateCondition(c, metrics));
}

export function describeGroup(group: RuleConditionGroup | null | undefined): string {
  if (!group || !group.conditions || group.conditions.length === 0) return "Sem condições";
  const joiner = group.operator === "AND" ? " E " : " OU ";
  return group.conditions
    .map((c) => `${fieldLabel(c.field)} ${operatorLabel(c.operator)} ${c.value}`)
    .join(joiner);
}
