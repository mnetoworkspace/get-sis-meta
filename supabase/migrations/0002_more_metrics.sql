-- sis-get-gastos: métricas adicionais (frequência, cliques no link, resultados/custo por resultado)

alter table insights_account_daily
  add column if not exists frequency numeric(10, 4),
  add column if not exists inline_link_clicks bigint,
  add column if not exists results bigint,
  add column if not exists result_type text,
  add column if not exists cost_per_result numeric(14, 4);

alter table insights_ad_daily
  add column if not exists frequency numeric(10, 4),
  add column if not exists inline_link_clicks bigint,
  add column if not exists results bigint,
  add column if not exists result_type text,
  add column if not exists cost_per_result numeric(14, 4);
