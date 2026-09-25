-- sis-get-gastos: regras de automação de campanhas/conjuntos.
-- v1 só implementa uma combinação real (metric=spend, condition=no_ftd,
-- action=pause_adset), mas o schema já é genérico pra receber novos tipos
-- de métrica/condição/ação sem precisar de outra migration — só passa a
-- aceitar o novo valor no motor (src/lib/automation/rules-engine.ts) e na UI.

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'adset', -- 'adset' (futuro: 'campaign')
  metric text not null default 'spend', -- 'spend' (futuro: 'cost_per_result', etc.)
  threshold numeric(14, 2) not null,
  condition text not null default 'no_ftd', -- 'no_ftd' (futuro: outras condições)
  time_window text not null default 'today', -- 'today' | 'lifetime' ("window" é palavra reservada no Postgres)
  action text not null default 'pause', -- 'pause' (futuro: 'notify_only', 'activate')
  bm_ids text[] not null default '{}', -- vazio = aplica a todos os BMs
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_is_active_idx on automation_rules(is_active);

alter table automation_rules enable row level security;
