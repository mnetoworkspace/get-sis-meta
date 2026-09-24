-- sis-get-gastos: schema inicial
-- Estrutura: Business Managers -> Ad Accounts, credenciais de System User por BM,
-- e duas tabelas de insights (visão geral por conta/dia e detalhada por campanha/adset/ad).

create extension if not exists "pgcrypto";

-- Business Managers (BMs) do Meta
create table if not exists business_managers (
  id text primary key, -- Meta Business Manager ID
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Contas de anúncio associadas a cada BM
create table if not exists ad_accounts (
  id text primary key, -- formato "act_123456789"
  bm_id text not null references business_managers(id) on delete cascade,
  name text not null,
  currency text,
  status text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ad_accounts_bm_id_idx on ad_accounts(bm_id);

-- Token de System User por BM (gera acesso às contas de anúncio associadas a ele)
create table if not exists meta_credentials (
  id uuid primary key default gen_random_uuid(),
  bm_id text not null unique references business_managers(id) on delete cascade,
  system_user_token text not null,
  app_id text,
  app_secret text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Log de execuções de sincronização (manual, disparada pelo botão no frontend)
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'error', 'partial')),
  accounts_synced int not null default 0,
  accounts_failed int not null default 0,
  error_message text,
  triggered_by text not null default 'manual'
);

-- Visão geral: gasto agregado por conta/dia
create table if not exists insights_account_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null references ad_accounts(id) on delete cascade,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  reach bigint,
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  ctr numeric(8, 4),
  currency text,
  synced_at timestamptz not null default now(),
  unique (ad_account_id, date)
);

create index if not exists insights_account_daily_date_idx on insights_account_daily(date);

-- Visão detalhada: campanha / conjunto de anúncios / anúncio, por dia
create table if not exists insights_ad_daily (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null references ad_accounts(id) on delete cascade,
  date date not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null,
  adset_name text,
  ad_id text not null,
  ad_name text,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  reach bigint,
  cpc numeric(14, 4),
  cpm numeric(14, 4),
  ctr numeric(8, 4),
  currency text,
  synced_at timestamptz not null default now(),
  unique (ad_account_id, date, ad_id)
);

create index if not exists insights_ad_daily_date_idx on insights_ad_daily(date);
create index if not exists insights_ad_daily_account_idx on insights_ad_daily(ad_account_id);
create index if not exists insights_ad_daily_campaign_idx on insights_ad_daily(campaign_id);

-- RLS: todas as tabelas só são acessíveis via service_role (usado pelo backend Next.js).
-- Nenhuma policy é criada para anon/authenticated, então o acesso via chave pública fica bloqueado.
alter table business_managers enable row level security;
alter table ad_accounts enable row level security;
alter table meta_credentials enable row level security;
alter table sync_logs enable row level security;
alter table insights_account_daily enable row level security;
alter table insights_ad_daily enable row level security;
