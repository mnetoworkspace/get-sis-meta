-- sis-get-gastos: nova ação de regra "duplicate" (duplicar conjunto de
-- anúncios quando a condição bate) — a mais arriscada até agora, porque cria
-- objeto novo que gasta dinheiro sozinho, em vez de só ligar/desligar algo
-- que já existe. O limite de taxa é a trava principal contra duplicação em
-- cadeia (a cópia batendo a condição de novo e gerando outra cópia, sem
-- fim) — totalmente configurável por regra (ex: "5 por dia", "1 por hora").

alter table automation_rules add column if not exists duplicate_limit_count int;
alter table automation_rules add column if not exists duplicate_limit_window text;

-- Log de cada duplicação feita — usado tanto pra contar quantas aconteceram
-- dentro da janela de tempo (aplicar o limite) quanto como histórico
-- auditável de quem foi criado a partir de quem.
create table if not exists automation_rule_duplications (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references automation_rules(id) on delete cascade,
  ad_account_id text not null,
  source_object_id text not null,
  created_object_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists automation_rule_duplications_rule_time_idx
  on automation_rule_duplications(rule_id, created_at);

alter table automation_rule_duplications enable row level security;
