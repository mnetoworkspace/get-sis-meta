# sis-get-gastos

Painel de gastos do Meta Ads (Marketing API) consolidado por Business Manager
e conta de anúncio, com dados persistidos no Supabase. Sincronização
disparada manualmente pelo botão "Sincronizar agora" no dashboard.

## Como funciona

- **Backend + frontend**: um único app Next.js (App Router). As rotas em
  `src/app/api/*` rodam server-side e usam a **service role key** do
  Supabase — nunca exposta ao browser.
- **Banco**: Supabase (Postgres). Schema em `supabase/migrations/0001_init.sql`.
- **Meta Marketing API**: cliente em `src/lib/meta.ts`, usa os tokens de
  System User já gerados (sem fluxo OAuth).
- **Dados coletados**:
  - `insights_account_daily`: gasto agregado por conta/dia (aba "Visão geral").
  - `insights_ad_daily`: gasto por campanha/conjunto/anúncio/dia (aba
    "Detalhado").

## Setup

### 1. Criar o projeto no Supabase

1. Crie um projeto em https://supabase.com.
2. No SQL Editor, rode o conteúdo de `supabase/migrations/0001_init.sql`
   (ou use `supabase db push` com o CLI, se preferir).
3. Copie a **Project URL** e a **service_role key** (Settings → API).

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
META_GRAPH_API_VERSION=v21.0
```

Não é necessário colocar tokens da Meta em variável de ambiente — eles são
cadastrados pela tela `/admin` e ficam salvos na tabela `meta_credentials`.

### 3. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000/admin e cadastre:

1. **Business Manager**: ID do BM, nome, e o token do System User (o mesmo
   token que já foi gerado e associado às contas de anúncio).
2. **Contas de anúncio**: clique em "Importar contas da Meta" para buscar
   automaticamente via API (usa `owned_ad_accounts` / `client_ad_accounts`
   do BM), ou adicione manualmente pelo ID (`act_...`).

Depois volte para `/` e clique em **Sincronizar agora** — isso busca os
insights (spend, impressões, cliques, CPC, CPM, CTR) da Meta Marketing API
no intervalo de datas selecionado e grava no Supabase.

## Deploy no EasyPanel

O projeto já tem `Dockerfile` (multi-stage, usa `output: "standalone"` do
Next.js) e `.dockerignore` prontos.

1. No EasyPanel, crie um novo serviço do tipo **App** apontando para este
   repositório (Dockerfile detectado automaticamente).
2. Configure as variáveis de ambiente do serviço:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `META_GRAPH_API_VERSION` (opcional, default `v21.0`)
3. Porta interna: `3000`.
4. Deploy. O app sobe com `node server.js` (build standalone do Next.js).

## Segurança

- As tabelas do Supabase têm RLS habilitado sem policies para
  `anon`/`authenticated` — só a service role (usada pelo backend) acessa os
  dados. Nunca use a `anon key` neste projeto.
- Os tokens de System User ficam salvos em texto simples na tabela
  `meta_credentials`. Restrinja o acesso ao painel `/admin` (ex.: colocar
  atrás de autenticação/VPN no EasyPanel) antes de usar em produção com
  dados sensíveis.
