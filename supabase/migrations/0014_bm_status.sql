-- sis-get-gastos: status da própria Business Manager (não só das contas) —
-- uma BM inteira pode levar bloqueio, derrubando todas as contas de uma vez.
-- meta_status/meta_status_detail vêm de uma chamada leve à Graph API
-- (GET /{bm_id}) feita com o token da própria BM: sucesso = ACTIVE, erro =
-- guardamos a mensagem crua da Meta pra pessoa julgar (não tentamos
-- categorizar o motivo, só reportar o que a API disse).

alter table business_managers add column if not exists meta_status text;
alter table business_managers add column if not exists meta_status_detail text;
alter table business_managers add column if not exists status_checked_at timestamptz;
