import { NextResponse } from "next/server";
import { createSupabaseAdminClient, fetchAllRows } from "@/lib/supabase";
import {
  fetchAccountDailyInsights,
  fetchAccountHourlyInsights,
  fetchAdLevelDailyInsights,
  fetchFundingSource,
} from "@/lib/meta";
import { pickFtd, pickResult } from "@/lib/results";
import { fetchHourlyTraffic, getFathomSiteId } from "@/lib/fathom";
import { fetchAllDeposits } from "@/lib/payments";
import { fetchExchangeRate } from "@/lib/fx";
import type { AdAccount, MetaCredential } from "@/types/db";

// "00:00:00 - 00:59:59" -> 0
function parseHourBucket(label: string): number {
  const match = label.match(/^(\d{1,2}):/);
  return match ? Number(match[1]) : 0;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Erros do Supabase/PostgREST são objetos { message, code, ... }, não
// instanceof Error — sem isso caem no fallback genérico e escondem a causa.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Erro desconhecido";
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function num(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function defaultDateRange() {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();

  let since: string;
  let until: string;
  try {
    const body = await request.json().catch(() => ({}));
    const defaults = defaultDateRange();
    since = body.since || defaults.since;
    until = body.until || defaults.until;
  } catch {
    const defaults = defaultDateRange();
    since = defaults.since;
    until = defaults.until;
  }

  const { data: logRow, error: logError } = await supabase
    .from("sync_logs")
    .insert({ status: "running", triggered_by: "manual" })
    .select()
    .single();

  if (logError || !logRow) {
    return NextResponse.json(
      { error: "Falha ao iniciar log de sincronização", details: logError },
      { status: 500 },
    );
  }

  const syncLogId = logRow.id as string;

  let accountsSynced = 0;
  let accountsFailed = 0;
  const errors: { ad_account_id: string; message: string }[] = [];

  try {
    const { data: credentials, error: credError } = await supabase
      .from("meta_credentials")
      .select("*")
      .returns<MetaCredential[]>();

    if (credError) throw credError;

    for (const credential of credentials || []) {
      const { data: adAccounts, error: accError } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("bm_id", credential.bm_id)
        .eq("is_active", true)
        .returns<AdAccount[]>();

      if (accError) throw accError;

      for (const account of adAccounts || []) {
        try {
          const [accountDaily, adDaily, accountHourly, fundingSource] = await Promise.all([
            fetchAccountDailyInsights(
              account.id,
              credential.system_user_token,
              since,
              until,
            ),
            fetchAdLevelDailyInsights(
              account.id,
              credential.system_user_token,
              since,
              until,
            ),
            fetchAccountHourlyInsights(
              account.id,
              credential.system_user_token,
              since,
              until,
            ),
            // undefined = a chamada falhou (ex: sem permissão) — não sobrescreve
            // o que já está salvo. null = a Meta confirmou que não há cartão.
            fetchFundingSource(account.id, credential.system_user_token).catch(() => undefined),
          ]);

          if (fundingSource !== undefined) {
            const { error: fundingError } = await supabase
              .from("ad_accounts")
              .update({ funding_source: fundingSource })
              .eq("id", account.id);
            if (fundingError) throw fundingError;
          }

          if (accountDaily.length > 0) {
            const rows = accountDaily.map((row) => {
              const spend = num(row.spend);
              const { results, resultType, costPerResult } = pickResult(
                row.actions,
                row.cost_per_action_type,
                spend,
              );
              const { ftd, costPerFtd } = pickFtd(row.actions, row.cost_per_action_type, spend);
              return {
                ad_account_id: account.id,
                date: row.date_start,
                spend,
                impressions: num(row.impressions),
                clicks: num(row.clicks),
                reach: row.reach ? num(row.reach) : null,
                frequency: row.frequency ? num(row.frequency) : null,
                inline_link_clicks: row.inline_link_clicks ? num(row.inline_link_clicks) : null,
                cpc: row.cpc ? num(row.cpc) : null,
                cpm: row.cpm ? num(row.cpm) : null,
                ctr: row.ctr ? num(row.ctr) : null,
                results,
                result_type: resultType,
                cost_per_result: costPerResult,
                ftd,
                cost_per_ftd: costPerFtd,
                currency: account.currency,
                synced_at: new Date().toISOString(),
              };
            });

            const { error: upsertError } = await supabase
              .from("insights_account_daily")
              .upsert(rows, { onConflict: "ad_account_id,date" });

            if (upsertError) throw upsertError;
          }

          if (adDaily.length > 0) {
            const rows = adDaily.map((row) => {
              const spend = num(row.spend);
              const { results, resultType, costPerResult } = pickResult(
                row.actions,
                row.cost_per_action_type,
                spend,
              );
              const { ftd, costPerFtd } = pickFtd(row.actions, row.cost_per_action_type, spend);
              return {
                ad_account_id: account.id,
                date: row.date_start,
                campaign_id: row.campaign_id,
                campaign_name: row.campaign_name ?? null,
                adset_id: row.adset_id,
                adset_name: row.adset_name ?? null,
                ad_id: row.ad_id,
                ad_name: row.ad_name ?? null,
                spend,
                impressions: num(row.impressions),
                clicks: num(row.clicks),
                reach: row.reach ? num(row.reach) : null,
                frequency: row.frequency ? num(row.frequency) : null,
                inline_link_clicks: row.inline_link_clicks ? num(row.inline_link_clicks) : null,
                cpc: row.cpc ? num(row.cpc) : null,
                cpm: row.cpm ? num(row.cpm) : null,
                ctr: row.ctr ? num(row.ctr) : null,
                results,
                result_type: resultType,
                cost_per_result: costPerResult,
                ftd,
                cost_per_ftd: costPerFtd,
                currency: account.currency,
                synced_at: new Date().toISOString(),
              };
            });

            const { error: upsertError } = await supabase
              .from("insights_ad_daily")
              .upsert(rows, { onConflict: "ad_account_id,date,ad_id" });

            if (upsertError) throw upsertError;
          }

          if (accountHourly.length > 0) {
            const rows = accountHourly.map((row) => {
              const spend = num(row.spend);
              const { results, costPerResult } = pickResult(row.actions, row.cost_per_action_type, spend);
              return {
                ad_account_id: account.id,
                date: row.date_start,
                hour: parseHourBucket(row.hourly_stats_aggregated_by_advertiser_time_zone),
                spend,
                impressions: num(row.impressions),
                clicks: num(row.clicks),
                results,
                cost_per_result: costPerResult,
                currency: account.currency,
                synced_at: new Date().toISOString(),
              };
            });

            const { error: upsertError } = await supabase
              .from("insights_account_hourly")
              .upsert(rows, { onConflict: "ad_account_id,date,hour" });

            if (upsertError) throw upsertError;
          }

          accountsSynced += 1;
        } catch (err) {
          accountsFailed += 1;
          errors.push({ ad_account_id: account.id, message: errorMessage(err) });
        }
      }
    }

    if (process.env.FATHOM_API_TOKEN && process.env.FATHOM_SITE_ID) {
      try {
        const siteId = getFathomSiteId();
        const hourlyTraffic = await fetchHourlyTraffic(siteId, since, until);

        if (hourlyTraffic.length > 0) {
          const rows = hourlyTraffic.map((row) => {
            const [date, time] = row.date.split(" ");
            return {
              site_id: siteId,
              date,
              hour: Number(time.slice(0, 2)),
              visits: num(row.visits),
              pageviews: num(row.pageviews),
              avg_duration: row.avg_duration ? num(row.avg_duration) : null,
              synced_at: new Date().toISOString(),
            };
          });

          const { error: upsertError } = await supabase
            .from("traffic_hourly")
            .upsert(rows, { onConflict: "site_id,date,hour" });

          if (upsertError) throw upsertError;
        }
      } catch (err) {
        errors.push({ ad_account_id: "fathom", message: errorMessage(err) });
      }
    }

    try {
      const deposits = await fetchAllDeposits(since, until);

      if (deposits.length > 0) {
        const rows = deposits.map((d) => ({
          id: d.id,
          player_id: d.player_id,
          amount: d.amount,
          currency: d.currency,
          status: d.status,
          payment_method: d.payment_method,
          payment_method_name: d.payment_method_name,
          gateway: d.gateway,
          test_user: d.test_user,
          created_at: d.created_at,
          processed_at: d.processed_at,
          synced_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase.from("deposits").upsert(rows, { onConflict: "id" });
        if (upsertError) throw upsertError;

        // Reconcilia FTD: pra cada jogador que apareceu neste lote, o depósito
        // COMPLETED mais antigo que já temos guardado vira o FTD; os demais não.
        // As chamadas .in() são feitas em lotes pequenos — com centenas de ids
        // de uma vez a URL passa dos ~8KB e a infra (proxy/CDN) rejeita com 400
        // antes de chegar no Postgres.
        const playerIds = [...new Set(deposits.filter((d) => d.status === "COMPLETED").map((d) => d.player_id))];

        if (playerIds.length > 0) {
          const firstByPlayer = new Map<string, { id: string; created_at: string }>();
          const allExistingIds: string[] = [];

          for (const playerChunk of chunk(playerIds, 50)) {
            const existing = await fetchAllRows<{ id: string; player_id: string; created_at: string }>(
              (from, to) =>
                supabase
                  .from("deposits")
                  .select("id, player_id, created_at")
                  .in("player_id", playerChunk)
                  .eq("status", "COMPLETED")
                  .range(from, to),
            );

            for (const d of existing) {
              allExistingIds.push(d.id);
              const curr = firstByPlayer.get(d.player_id);
              if (!curr || d.created_at < curr.created_at) firstByPlayer.set(d.player_id, d);
            }
          }

          const ftdIds = new Set([...firstByPlayer.values()].map((d) => d.id));
          const nonFtdIds = allExistingIds.filter((id) => !ftdIds.has(id));

          for (const idChunk of chunk([...ftdIds], 100)) {
            const { error } = await supabase.from("deposits").update({ is_ftd: true }).in("id", idChunk);
            if (error) throw error;
          }
          for (const idChunk of chunk(nonFtdIds, 100)) {
            const { error } = await supabase.from("deposits").update({ is_ftd: false }).in("id", idChunk);
            if (error) throw error;
          }
        }
      }

      // Cotação pra cada moeda de depósito != BRL, usada pra comparar com o
      // gasto de anúncio (sempre em BRL) sem misturar os valores nativos.
      const foreignCurrencies = [...new Set(deposits.map((d) => d.currency).filter((c) => c !== "BRL"))];
      for (const currency of foreignCurrencies) {
        const rate = await fetchExchangeRate(currency, "BRL");
        if (rate != null) {
          const { error } = await supabase
            .from("fx_rates")
            .upsert(
              { base_currency: currency, quote_currency: "BRL", rate, fetched_at: new Date().toISOString() },
              { onConflict: "base_currency,quote_currency" },
            );
          if (error) throw error;
        }
      }
    } catch (err) {
      errors.push({ ad_account_id: "deposits", message: errorMessage(err) });
    }

    const status = accountsFailed === 0 ? "success" : accountsSynced === 0 ? "error" : "partial";

    await supabase
      .from("sync_logs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        accounts_synced: accountsSynced,
        accounts_failed: accountsFailed,
        error_message: errors.length > 0 ? JSON.stringify(errors) : null,
      })
      .eq("id", syncLogId);

    return NextResponse.json({
      status,
      since,
      until,
      accounts_synced: accountsSynced,
      accounts_failed: accountsFailed,
      errors,
    });
  } catch (err) {
    const message = errorMessage(err);

    await supabase
      .from("sync_logs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        accounts_synced: accountsSynced,
        accounts_failed: accountsFailed,
        error_message: message,
      })
      .eq("id", syncLogId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
