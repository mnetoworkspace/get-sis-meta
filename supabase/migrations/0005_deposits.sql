-- sis-get-gastos: depósitos (API de pagamentos da Rakebet)
-- Sem dados pessoais (nome/email/telefone) — só o necessário pra agregações
-- e detecção de FTD (primeiro depósito visto por jogador nos nossos dados).

create table if not exists deposits (
  id text primary key, -- id do depósito na API de pagamentos
  player_id text not null,
  amount numeric(14, 2) not null,
  currency text not null,
  status text not null,
  payment_method text,
  payment_method_name text,
  gateway text,
  test_user boolean not null default false,
  is_ftd boolean not null default false,
  created_at timestamptz not null,
  processed_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists deposits_created_at_idx on deposits(created_at);
create index if not exists deposits_player_id_idx on deposits(player_id);
create index if not exists deposits_currency_idx on deposits(currency);

alter table deposits enable row level security;
