-- sis-get-gastos: webhook genérico de notificação — qualquer serviço
-- externo (Zapier, Make, um automation qualquer) pode chamar
-- /api/webhooks/notify/<token> com um corpo {"title": "...", "text": "..."}
-- e isso vira notificação dentro do app + push, sem depender de um
-- serviço terceiro tipo Pushcut. webhook_token é gerado sob demanda
-- (primeira vez que a aba de notificações é aberta), não na migration.

alter table notification_settings
  add column if not exists webhook_enabled boolean not null default true,
  add column if not exists webhook_silent boolean not null default false,
  add column if not exists webhook_token text;
