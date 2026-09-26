-- sis-get-gastos: métrica dedicada de Lead ("Cadastro" no dashboard) pros
-- cards gerais do topo — pedido do usuário pra parar de misturar Lead com
-- visualização de página/clique no link/etc. no número de "Resultado".
-- Só na tabela usada pelos cards do dash geral (insights_account_daily);
-- a tabela por anúncio (insights_ad_daily) continua com o "Resultado" de
-- prioridade em cascata, que já mostra o tipo real entre parênteses.

alter table insights_account_daily add column if not exists leads bigint;
alter table insights_account_daily add column if not exists cost_per_lead numeric(14, 4);
