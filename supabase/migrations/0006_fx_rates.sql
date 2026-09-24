-- sis-get-gastos: cotações de câmbio (pra comparar depósitos em outras
-- moedas, ex: COP, com o gasto de anúncio que é sempre em BRL).

create table if not exists fx_rates (
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18, 8) not null,
  fetched_at timestamptz not null default now(),
  primary key (base_currency, quote_currency)
);

alter table fx_rates enable row level security;
