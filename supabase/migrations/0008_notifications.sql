-- sis-get-gastos: notificações push de depósito.
-- notifications: registro/dedupe do que já foi disparado (novo depósito,
-- silêncio de depósito por período) — evita alerta duplicado a cada checagem.
-- push_subscriptions: inscrições Web Push do navegador (login único, sem
-- escopo por usuário — qualquer dispositivo logado recebe todos os alertas).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text,
  metadata jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists notifications_type_idx on notifications(type);
create index if not exists notifications_created_at_idx on notifications(created_at);

alter table notifications enable row level security;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
