-- sis-get-gastos: cartão/fonte de pagamento vinculado a cada conta de anúncio na Meta

alter table ad_accounts
  add column if not exists funding_source text;
