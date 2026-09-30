# PROJECT.md — Traffic RakeBet (sis-get-gastos)

> Este arquivo existe pra qualquer IA (ou pessoa) nova entender o sistema
> inteiro sem precisar reconstruir o contexto do zero. Se você é uma IA lendo
> isso pela primeira vez: leia inteiro antes de mexer em qualquer coisa. Ele é
> mantido manualmente — se você fizer uma mudança estrutural relevante
> (nova tabela, nova integração, mudança de arquitetura), atualize este
> arquivo também.

## O que é isso

Painel interno da **Rakebet** (operação de apostas colombiana) pra
consolidar, num só lugar, o que hoje fica espalhado em ferramentas
diferentes:

- **Gasto de tráfego pago** (Meta Ads — Facebook/Instagram)
- **Tráfego do site** (Fathom Analytics)
- **Depósitos e FTD** (API de pagamentos própria da Rakebet, o
  "backoffice")
- **Automação de campanhas** (pausar/ativar/ajustar orçamento/duplicar/
  excluir automaticamente, baseado em regras configuráveis)
- **Notificações push** (depósito novo, silêncio de depósito, regra
  disparada, conta/BM com problema)
- **Saldo de cartão** (controlado manualmente, já que a Meta não expõe isso)

Não é multi-tenant, não tem cadastro de usuário — é **login único
compartilhado** (usuário/senha fixos via env var) pra proteger o painel,
usado só pelo time interno.

## Stack técnica

- **Next.js 16** (App Router, TypeScript, Turbopack), **React 19**,
  **Tailwind v4**.
- Deploy: **Docker standalone** (`output: "standalone"` no
  `next.config.ts`), hospedado em **EasyPanel** — é um container fixo de
  longa duração, **não é serverless**. Isso importa porque o app usa
  `instrumentation.ts` como agendador em processo (ver seção "Agendador").
- Banco: **Supabase** (Postgres), acessado só via
  `createSupabaseAdminClient()` (`src/lib/supabase.ts`) com a
  `service_role` key — **server-only**, nunca importar esse arquivo em
  componente `"use client"`. Não há RLS policy pra `anon`/`authenticated`,
  então o banco só é acessível pela própria API do Next.js.
- Gráficos: `recharts`. Notificação push: `web-push` (Web Push API padrão,
  VAPID).
- **Sem ORM** — todas as queries são via `@supabase/supabase-js`
  (`.from(...).select(...)` etc.), e paginação manual quando passa de 1000
  linhas (limite do PostgREST) via `fetchAllRows()` em `src/lib/supabase.ts`.

### ⚠️ Antes de escrever qualquer código Next.js

O repo tem um `AGENTS.md` (incluído no `CLAUDE.md` via `@AGENTS.md`) que
avisa: essa versão do Next.js pode ter breaking changes em relação ao que
qualquer IA "sabe" por treinamento. **Leia
`node_modules/next/dist/docs/` antes de escrever código novo.** Esse aviso
é regravado automaticamente pelo próprio `next dev` — não remova.

## Integrações externas

| Sistema | Uso | Onde no código |
|---|---|---|
| **Meta Graph API** (v21.0, configurável via `META_GRAPH_API_VERSION`) | Ler gasto/insights, pausar/ativar/duplicar/excluir campanhas, ler orçamento, listar contas de anúncio | `src/lib/meta.ts` |
| **API de pagamentos da Rakebet** ("backoffice") | Depósitos, detecção de FTD real | `src/lib/payments.ts` |
| **Fathom Analytics** | Tráfego do site (visitas, pageviews por hora) | `src/lib/fathom.ts` |
| **Supabase** | Banco de dados (todas as tabelas) | `src/lib/supabase.ts` |

Cada BM (Business Manager da Meta) tem seu próprio token de **System
User** salvo em `meta_credentials.system_user_token` — não é OAuth, é
token de longa duração gerado manualmente no Business Manager. Uma conta
de anúncio pertence a um BM (`ad_accounts.bm_id`), e o token usado pra
falar com a Meta sobre aquela conta é sempre o do BM dela.

## Fusos horários — ponto de bug recorrente, leia com atenção

Esse é o tipo de coisa que já causou bug real (`815bdb7`) e é fácil
errar de novo:

- **Meta Ads (gasto, campanhas)**: contas rodam em **America/Sao_Paulo
  (UTC-3, sem horário de verão)** — confirmado direto via Graph API
  (campo `timezone_name`), não é suposição. Helper: `nowInBrazil()` /
  `todayISO()` / `nowHourInBrazil()` / `toBrazilDateHour()` em
  `src/lib/format.ts`.
- **Depósitos (API de pagamentos)**: opera em **horário de Bogotá
  (UTC-5, sem horário de verão)** — validado contra o backoffice deles.
  Helper: `BOGOTA_OFFSET` / `bogotaDateBoundary()` / `toBogotaDate()` /
  `toBogotaHour()` em `src/lib/payments.ts`.
- **Nunca misture os dois.** Gasto/campanha usa os helpers de
  `format.ts`; depósito/FTD usa os helpers de `payments.ts`. Um "Hoje"
  calculado com o offset errado desloca a virada do dia em até algumas
  horas e faz o filtro pedir uma data sem dado sincronizado ainda.

## Modelo de dados (Supabase)

17 migrations em `supabase/migrations/` (`0001` a `0017`), todas
idempotentes (`create table if not exists`, `add column if not
exists`) — **seguras de rodar de novo**. Não há migration runner
automático: elas são rodadas manualmente no SQL Editor do Supabase
(direto em produção) quando uma nova é criada. Sempre que criar uma
migration nova, **rode ela em produção também**, não só localmente —
esse é um passo que fica pendente com frequência nesse projeto.

Tabelas principais, por área:

**Estrutura / credenciais**
- `business_managers` — BMs cadastrados.
- `ad_accounts` — contas de anúncio, com `status` (texto cru da Meta:
  `ACTIVE`/`DISABLED`/`UNSETTLED`/...), `funding_source` (nome do
  cartão, ex: "Mastercard \*0454", sincronizado da Meta), `currency`.
- `meta_credentials` — token de System User por BM.

**Gasto/insights (sincronizados da Meta)**
- `insights_account_daily` — gasto por conta/dia. Alimenta os cards
  gerais do dashboard. Tem `leads`/`cost_per_lead` (Lead dedicado,
  não o "resultado" genérico) e `results`/`result_type`/`cost_per_result`
  (heurística de prioridade — ver seção FTD/Resultado abaixo).
- `insights_ad_daily` — mesma coisa, quebrado por
  campanha/conjunto/anúncio.
- `insights_account_hourly` — gasto por hora do dia (conta), inclui
  `ftd`/`cost_per_ftd` por hora.

**Depósitos**
- `deposits` — depósitos da API de pagamentos, com `is_ftd` (reconciliado:
  o depósito `COMPLETED` mais antigo por jogador vira FTD). **Sem dados
  pessoais** (nome/email/telefone não são armazenados).

**Automação**
- `automation_rules` — regras (ver seção própria abaixo).
- `automation_rule_duplications` — histórico de duplicações (usado pra
  aplicar o limite de taxa).

**Notificações**
- `notifications` — toda notificação gerada (dedupe via `dedupe_key`
  unique).
- `notification_settings` — singleton (`id=1`) com liga/desliga +
  silenciosa por categoria.
- `push_subscriptions` — inscrições Web Push do navegador.

**Cartões**
- `cards` — saldo atual por cartão (`funding_source` como chave única).
- `card_reloads` — histórico de recargas.

**Tráfego**
- `traffic_hourly` — visitas/pageviews por hora (Fathom).

**Operacional**
- `sync_logs` — log de cada sincronização.

## O agendador (`src/instrumentation.ts`)

Como o container é de longa duração (não serverless), o app usa o hook
`register()` do Next.js pra manter um `setInterval` rodando dentro do
próprio processo, a cada `DEPOSIT_CHECK_INTERVAL_MINUTES` (padrão 5min).
A cada ciclo, roda em paralelo:

1. `checkDeposits()` (`src/lib/notifications/deposit-watch.ts`) —
   depósito novo + silêncio de depósito.
2. `runAutomationRules()` (`src/lib/automation/rules-engine.ts`) —
   avalia e aplica todas as regras ativas.
3. `checkAccountStatus()` (`src/lib/notifications/account-status-watch.ts`)
   — status de conta e de BM inteira.

Um `globalThis` flag (`__backgroundChecksStarted`) evita dobrar o
agendador se o hook rodar mais de uma vez. **Isso não sincroniza gasto da
Meta** — isso é feito só pelo botão "Sincronizar agora" no dashboard
(`POST /api/sync`), manual.

## As regras de automação — a parte mais complexa do sistema

`src/lib/automation/rules-engine.ts` + `src/lib/automation/rule-types.ts`
+ UI em `src/components/RulesPanel.tsx`.

Cada regra tem: **nível** (campanha/conjunto/anúncio), **janela**
(hoje / acumulado desde sempre), **condições** (grupo AND/OR de
comparações sobre `spend`/`ftd`/`cost_per_ftd`/`results`/`cost_per_result`)
e uma **ação**. A checagem roda no agendador (a cada 5min) ou sob
demanda (botão "Checar agora" → `POST /api/automation-rules/run`).

Ações disponíveis (`RuleAction`), em ordem crescente de risco:

1. **`pause`** / **`activate`** — muda `effective_status`.
2. **`increase_budget`** / **`decrease_budget`** — ajusta
   `daily_budget`/`lifetime_budget` em % ou valor fixo, com piso de
   segurança (`MIN_BUDGET_CENTS = 500`, R$5,00). **Trata CBO**: se o
   objeto não tem orçamento próprio, sobe pra campanha (ver "Bugs já
   corrigidos" abaixo).
3. **`duplicate`** — duplica um conjunto de anúncios inteiro (lê config
   completa + recria, a Meta não tem endpoint de "duplicar"). Nasce
   **ativo**, gastando na hora. Só nível conjunto. Trava principal:
   limite de taxa configurável por regra (N duplicações por
   minuto/hora/dia), compartilhado entre todas as contas que a regra
   varre no mesmo ciclo.
4. **`delete_rejected`** — quando a Meta reprova um anúncio
   (`effective_status = DISAPPROVED`), exclui automaticamente. Se o
   conjunto tiver outros anúncios, exclui só o anúncio; se for o único,
   exclui o conjunto inteiro. **Irreversível** (diferente de pausar).
   Gatilho é implícito (não usa o grupo de condições) — busca estrutural
   direto (`fetchRejectedAds`), porque anúncio rejeitado normalmente
   nunca gastou nada e não aparece nos dados de insight.

Dedupe: cada ação bem-sucedida grava uma notificação com `dedupe_key`
único (índice unique em `notifications.dedupe_key`, erro `23505`
tratado como "já processado, ignora"). Pra `pause`/`activate`/orçamento,
o dedupe é por dia (reseta); pra `duplicate`, é por evento (cada cópia é
única, a trava real é o limite de taxa); pra `delete_rejected`, é
permanente por `ad_id` (uma vez excluído, não existe mais pra
reavaliar).

## FTD e "Resultado" — cuidado, tem 3 números diferentes

Isso já confundiu o próprio usuário do sistema, então merece destaque:

1. **`ftd` em `insights_*` (pixel da Meta)** — o que a Meta atribui como
   conversão de compra. **Sub-conta bastante** (perda de atribuição:
   iOS, ad blocker, cross-device). Usado nas tabelas detalhadas
   (`SpendTable`, `DetailedTable`), não nos cards gerais do topo.
2. **FTD real (backoffice)** — `deposits.is_ftd`, reconciliado (primeiro
   depósito `COMPLETED` por jogador). É o número de verdade. **Os cards
   "FTD"/"Custo/FTD" do topo do dashboard usam esse número**, não o da
   Meta (`Custo/FTD = Gasto ÷ FTD real`). Importante: esse FTD real
   **não filtra por BM/conta** — o backoffice não sabe de qual anúncio
   veio o depósito, então é sempre o total do negócio no período,
   mesmo com filtro de conta ativo. Exemplo real medido: Meta reportava
   218 FTD num período em que o backoffice tinha 902.
3. **"Cadastro" = Lead** — os cards "Cadastro"/"Custo/Cadastro" do topo
   são o Lead da Meta (`pickLead()` em `src/lib/results.ts`), **não**
   um "resultado" genérico. Antes eram calculados com prioridade em
   cascata (Lead → FTD → Conversa → Cadastro → Visualização de página →
   Clique no link — `pickResult()`), que misturava sinais bem diferentes
   num só número. Isso ainda existe e é usado nas tabelas detalhadas
   (aparece como "(Lead)"/"(Visualização da página)" etc. entre
   parênteses ao lado do número), mas os cards do topo não usam mais
   essa cascata.

## Previsão de gasto do dia

`src/app/api/forecast/today/route.ts` + `src/components/ForecastCard.tsx`
— só aparece quando o período selecionado é "Hoje". Dois números:

- **Teto orçamentário**: soma de `daily_budget` de campanhas/conjuntos
  **ativos**, em contas com `status = ACTIVE` de verdade (não
  `UNSETTLED`/`DISABLED`) + rateio de orçamento **vitalício** (valor
  total ÷ dias restantes até `stop_time` — aproximação explícita, não
  um limite real).
- **Projeção realista**: gasto já feito hoje + extrapolação baseada no
  ritmo das **últimas horas de hoje** (não histórico de dias), capada
  pelo teto quando ele ainda é maior que o gasto atual.

O gasto realizado vem de `insights_account_daily`, como o card Gasto,
incluindo contas que gastaram e depois ficaram inativas. Apenas a parcela
futura depende de contas/objetos ativos; falhas na consulta de orçamento
não removem gastos já registrados. O ritmo usa as últimas três horas
fechadas (horas ausentes contam como zero), com fração de hora no tempo
restante. A previsão respeita os filtros de BM/contas e recarrega depois
de cada tentativa de sincronização. Orçamento CBO vitalício também evita
contar novamente o orçamento dos conjuntos.

## Saldo de cartão

A Meta não expõe saldo de cartão via API — só o nome
(`funding_source`, ex: "Mastercard \*0454", que pode ser compartilhado
por várias contas). Modelo **carteira pré-paga**: saldo é cadastrado
manualmente (`POST /api/cards`, seção "Cartões" no topo da aba
Status), e o saldo mostrado desconta o gasto real sincronizado desde a
última recarga (mistura dado por hora no dia exato da recarga + dado
diário pros dias seguintes). Aviso visual configurável por cartão
quando o saldo cai abaixo de um limite.

## Notificações

`src/lib/notifications/settings.ts` define 4 categorias
(`NotificationCategory`): `deposit`, `deposit_silence`, `rules`,
`account_status` (esse último cobre tanto conta individual quanto BM
inteira). Cada uma tem liga/desliga + "silenciosa" (Web Push **não**
permite som customizado por tipo — só tocar o som padrão do aparelho ou
nada; é o máximo de personalização que dá pra fazer de verdade). UI em
`/notifications`.

Todo envio passa por `notificationDecision(categoria)` antes de chamar
`sendPushToAll()` — se a categoria estiver desligada, não manda nada
(mas ainda registra em `notifications` pra histórico/dedupe).

## Estrutura de páginas

| Rota | O quê |
|---|---|
| `/` | Dashboard principal (`Dashboard.tsx`) — abas Por BM / Por Conta / Detalhado / Tráfego e Depósitos |
| `/admin` | CRUD de BMs e contas de anúncio (`AdminPanel.tsx`) |
| `/rules` | Regras de automação (`RulesPanel.tsx`) |
| `/notifications` | Configuração de notificações |
| `/status` | Status de contas/BMs + Cartões (`StatusPanel.tsx`) |
| `/login` | Login único compartilhado |

O dashboard principal persiste estado (aba ativa, filtros, ordenação de
coluna, período) em `localStorage` por navegador — ver padrão "skip
first write" em `Dashboard.tsx`/`sort.ts`/`column-config.ts` (evita que
o valor padrão do mount sobrescreva o que tava salvo, antes do efeito
de carregamento aplicar).

## Variáveis de ambiente

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Meta
META_GRAPH_API_VERSION=v21.0   # opcional, tem default

# Fathom
FATHOM_API_TOKEN=
FATHOM_SITE_ID=

# API de pagamentos Rakebet
PAYMENTS_API_BASE=https://api-payments.rakebet.io   # tem default

# Login do painel (compartilhado, sem multi-usuário)
APP_LOGIN_USER=
APP_LOGIN_PASSWORD=
APP_AUTH_TOKEN=   # opcional — se ausente, é derivado de usuário+senha

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # precisa existir NO BUILD (vira parte do bundle client), não só em runtime

# Agendador
DEPOSIT_CHECK_INTERVAL_MINUTES=5   # opcional
DEPOSIT_SILENCE_MINUTES=60         # opcional
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` é o único caso especial: como é
`NEXT_PUBLIC_*`, o Next grava o valor dentro do bundle JS do client
**durante o build** — não lê `process.env` de novo quando o container
sobe depois. No `Dockerfile` isso é passado como `ARG`/`ENV` no estágio
de build, separado das variáveis secretas (que só existem em runtime).

## Deploy

1. `git push` pro repo.
2. No **EasyPanel**, redeploy manual (não há CI/CD automático
   configurado) — reconstrói a imagem Docker (`node:20-alpine`,
   multi-stage, `output: standalone`).
3. Se teve migration nova, **rodar ela no Supabase antes ou depois do
   deploy** (idempotente, mas o código novo pode depender da coluna
   nova existir).

Não existe staging — é produção direto. Testes de mudança geralmente são
feitos rodando `next dev` local apontando pro **mesmo Supabase de
produção** (`.env.local`), o que é intencional nesse projeto (não tem
banco de teste separado) — só ter cuidado redobrado com ações que
escrevem/alteram dado real (regras que pausam/excluem/duplicam objetos
reais na Meta).

## Convenções deste projeto (aprendidas ao longo do desenvolvimento)

- **Comentários em português, só quando o "porquê" não é óbvio** — não
  descrever o que o código faz, só decisões não-óbvias, gotchas, ou
  motivo de um workaround.
- **`null` vs `0` importa** — em métricas (`ftd`, `cost_per_ftd`,
  `results` etc.), `null` significa "sem dado" (não teve nenhuma
  ocorrência, vira "Sem dado"/gap visual no gráfico), `0` significa
  "teve dado, contagem real zero". Confundir os dois já causou um bug
  real (ver abaixo).
- **Ícone "?" (`InfoTooltip`, `src/components/ui/info-tooltip.tsx`)**
  pra texto explicativo — não deixar parágrafo de explicação sempre
  visível na UI; esconder atrás do ícone, deixar só o essencial à
  mostra.
- **Ações destrutivas/de risco na Meta pedem confirmação explícita do
  usuário antes de implementar** — esse projeto já teve uma conversa de
  design dedicada antes de cada ação nova de regra (duplicar, excluir
  rejeitado), cobrindo: o que dispara, o que exatamente é afetado, e
  qual trava de segurança existe.
- **Ao rodar SQL em produção via automação de navegador**: o editor
  Monaco do Supabase tem bugs conhecidos de auto-indentação em cascata
  e parênteses duplicados quando se digita SQL com múltiplas linhas de
  uma vez. Prática segura: digitar sem indentação manual (deixar o
  editor lidar com isso), conferir visualmente linha por linha antes de
  rodar (zoom + scroll, nunca `Page_Down` — a tecla não é reconhecida e
  vira texto literal).
- **`confirm()` nativo do navegador trava a automação** — funções que
  usam `window.confirm()` (ex: excluir regra) travam a aba quando
  testadas via automação de navegador. Preferir chamar a API
  diretamente (`curl`/`fetch`) pra testar exclusão, não clicar no botão.

## Bugs já corrigidos (não repetir)

1. **Timezone Bogotá vs Brasília** — `todayISO()` usava UTC-5 (Bogotá)
   pra gasto da Meta, mas as contas são UTC-3. Corrigido em `815bdb7`.
2. **CBO (Campaign Budget Optimization) silencioso** — regra de
   orçamento num conjunto de anúncio sem orçamento próprio (porque a
   campanha usa CBO) simplesmente não achava nada pra ajustar, sem erro
   nenhum. `resolveBudgetTarget()` agora sobe pra campanha nesse caso,
   e o dedupe usa o alvo resolvido (senão N conjuntos da mesma campanha
   CBO disparariam N ajustes separados no mesmo ciclo).
3. **Condição `ftd = 0` nunca disparava** — `pickFtd()`/`pickResult()`
   devolvem `null` quando a Meta não lista o `action_type` (que é como
   ela representa "zero" — omite a entrada, não manda valor 0), mas a
   avaliação de condição tratava `null` como "sem dado, pula" em vez de
   "zero real". Corrigido em `buildMetrics()` do motor de regras:
   quando a linha de insight existe (o objeto teve atividade no
   período), ausência de ação é uma contagem real de zero. **Isso fez a
   regra "pausar sem FTD" nunca ter pausado nada, desde que o sistema
   existe**, até ser corrigido.
4. **Projeção de gasto presa abaixo do teto** — o teto só soma
   orçamento diário; campanha de orçamento vitalício gastando bastante
   fazia o gasto real ultrapassar um teto que não a contava, e a
   projeção ficava artificialmente capada abaixo do que já tinha sido
   gasto de verdade. Corrigido: quando isso acontece, a extrapolação
   segue sem essa trava.
5. **Tooltip "?" saindo em CAIXA ALTA** — herdava `text-transform:
   uppercase` do rótulo pai via CSS. Corrigido forçando `normal-case`
   no popover do `InfoTooltip`.

## O que ainda não existe / limitações conhecidas

- Sem taxa de conversão real de depósito (tentativa → aprovado) — a API
  de pagamentos só expõe depósitos já `COMPLETED`, sem tentativas
  pendentes/rejeitadas.
- Duplicar campanha inteira (não só conjunto) não está implementado —
  decisão consciente de escopo, fica pra uma fase futura se precisar.
- Sem staging/ambiente de teste separado do Supabase de produção.
- Sem CI/CD automático — deploy é manual via EasyPanel.
- Cartão: saldo é só o que é informado manualmente; se esquecer de
  recarregar no sistema depois de recarregar de verdade, o saldo
  mostrado fica desatualizado/negativo (isso é esperado, é a natureza
  do dado ser manual).
