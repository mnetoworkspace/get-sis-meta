-- sis-get-gastos: saldo de cartão gerenciado manualmente (a Meta não expõe
-- saldo de cartão via API — só o "funding_source", já sincronizado em
-- ad_accounts). Modelo "carteira pré-paga": a pessoa cadastra o saldo
-- quando recarrega, e o saldo mostrado no painel vai descontando o gasto
-- real sincronizado a partir dali, até a próxima recarga. Um cartão pode
-- ser usado por várias contas ao mesmo tempo (chave é o texto do
-- funding_source, ex: "Mastercard *0454") — o desconto soma o gasto de
-- todas elas.

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  funding_source text not null unique,
  currency text,
  balance_cents bigint not null default 0,
  balance_set_at timestamptz not null default now(),
  low_balance_threshold_cents bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Histórico de recargas — auditável, não usado pro cálculo do saldo atual
-- (isso vem de cards.balance_cents/balance_set_at + gasto sincronizado).
create table if not exists card_reloads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists card_reloads_card_idx on card_reloads(card_id, created_at);

alter table cards enable row level security;
alter table card_reloads enable row level security;
