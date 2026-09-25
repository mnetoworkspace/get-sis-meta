-- sis-get-gastos: liga/desliga por tipo de notificação, e opção de
-- silenciosa por tipo (o máximo de "som customizado" que o Web Push
-- padrão permite — não dá pra escolher um arquivo de áudio específico,
-- só tocar o som padrão do aparelho ou não tocar nada).
-- Login único compartilhado — configuração global, não por usuário/sessão.

create table if not exists notification_settings (
  id int primary key default 1,
  deposit_enabled boolean not null default true,
  deposit_silent boolean not null default false,
  deposit_silence_enabled boolean not null default true,
  deposit_silence_silent boolean not null default false,
  rules_enabled boolean not null default true,
  rules_silent boolean not null default false,
  account_status_enabled boolean not null default true,
  account_status_silent boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_settings_singleton check (id = 1)
);

insert into notification_settings (id) values (1) on conflict (id) do nothing;

alter table notification_settings enable row level security;
