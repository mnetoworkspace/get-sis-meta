-- sis-get-gastos: FTD por hora (Meta) — até então só existia por dia
-- (insights_account_daily.ftd), faltava pro gráfico "Custo/FTD por hora".

alter table insights_account_hourly add column if not exists ftd bigint;
alter table insights_account_hourly add column if not exists cost_per_ftd numeric(14, 4);
