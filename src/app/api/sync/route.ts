import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  MetaApiError,
  fetchAccountDailyInsights,
  fetchAdLevelDailyInsights,
} from "@/lib/meta";
import { pickFtd, pickResult } from "@/lib/results";
import type { AdAccount, MetaCredential } from "@/types/db";

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
          const [accountDaily, adDaily] = await Promise.all([
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
          ]);

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

          accountsSynced += 1;
        } catch (err) {
          accountsFailed += 1;
          const message =
            err instanceof MetaApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Erro desconhecido";
          errors.push({ ad_account_id: account.id, message });
        }
      }
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
    const message = err instanceof Error ? err.message : "Erro desconhecido";

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
