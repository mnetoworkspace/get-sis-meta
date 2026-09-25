-- sis-get-gastos: regras de automação v2 — condições flexíveis (campo +
-- operador + valor, combinadas com TODAS/QUALQUER) em vez de um único
-- metric/condition/threshold fixo. Também libera o escopo pra campanha e
-- anúncio, não só conjunto, e a ação pra incluir "activate" além de "pause".

alter table automation_rules add column if not exists rules jsonb;

-- Converte qualquer regra existente (metric=spend, condition=no_ftd,
-- threshold=X) pro novo formato equivalente: gasto >= X E ftd = 0.
update automation_rules
set rules = jsonb_build_object(
  'operator', 'AND',
  'conditions', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'field', 'spend', 'operator', 'gte', 'value', threshold::text),
    jsonb_build_object('id', gen_random_uuid()::text, 'field', 'ftd', 'operator', 'eq', 'value', '0')
  )
)
where rules is null and threshold is not null;

update automation_rules
set rules = '{"operator":"AND","conditions":[]}'::jsonb
where rules is null;

alter table automation_rules alter column rules set default '{"operator":"AND","conditions":[]}'::jsonb;
alter table automation_rules alter column rules set not null;

alter table automation_rules drop column if exists metric;
alter table automation_rules drop column if exists condition;
alter table automation_rules drop column if exists threshold;
