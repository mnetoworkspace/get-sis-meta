-- sis-get-gastos: gasto por hora (Meta) e tráfego por hora (Fathom Analytics)

create table if not exists insights_account_hourly (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null references ad_accounts(id) on delete cascade,
  date date not null,
  hour smallint not null check (hour >= 0 and hour <= 23),
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  results bigint,
  cost_per_result numeric(14, 4),
  currency text,
  synced_at timestamptz not null default now(),
  unique (ad_account_id, date, hour)
);

create index if not exists insights_account_hourly_date_idx on insights_account_hourly(date);
create index if not exists insights_account_hourly_account_idx on insights_account_hourly(ad_account_id);

create table if not exists traffic_hourly (
  id uuid primary key default gen_random_uuid(),
  site_id text not null,
  date date not null,
  hour smallint not null check (hour >= 0 and hour <= 23),
  visits bigint not null default 0,
  pageviews bigint not null default 0,
  avg_duration numeric(10, 2),
  synced_at timestamptz not null default now(),
  unique (site_id, date, hour)
);

create index if not exists traffic_hourly_date_idx on traffic_hourly(date);

alter table insights_account_hourly enable row level security;
alter table traffic_hourly enable row level security;
