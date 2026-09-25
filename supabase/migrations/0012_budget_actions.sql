-- sis-get-gastos: ação de aumentar/diminuir orçamento nas regras de
-- automação, além de pausar/ativar. budget_adjustment_type/value só são
-- usados quando action = 'increase_budget' | 'decrease_budget'.

alter table automation_rules add column if not exists budget_adjustment_type text;
alter table automation_rules add column if not exists budget_adjustment_value numeric(14, 2);
