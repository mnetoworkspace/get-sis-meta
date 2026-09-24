-- sis-get-gastos: métrica dedicada de FTD (compra), separada do "resultado" genérico

alter table insights_account_daily
  add column if not exists ftd bigint,
  add column if not exists cost_per_ftd numeric(14, 4);

alter table insights_ad_daily
  add column if not exists ftd bigint,
  add column if not exists cost_per_ftd numeric(14, 4);
