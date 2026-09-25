export interface BusinessManager {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface AdAccount {
  id: string; // "act_123456789"
  bm_id: string;
  name: string;
  currency: string | null;
  status: string | null;
  is_active: boolean;
  funding_source: string | null; // ex: "Mastercard *7617"
  created_at: string;
}

export interface MetaCredential {
  id: string;
  bm_id: string;
  system_user_token: string;
  app_id: string | null;
  app_secret: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error" | "partial";
  accounts_synced: number;
  accounts_failed: number;
  error_message: string | null;
  triggered_by: string;
}

export interface InsightsAccountDaily {
  id: string;
  ad_account_id: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  frequency: number | null;
  inline_link_clicks: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  ftd: number | null;
  cost_per_ftd: number | null;
  currency: string | null;
  synced_at: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  scope: "campaign" | "adset" | "ad";
  time_window: "today" | "lifetime";
  action: import("@/lib/automation/rule-types").RuleAction;
  rules: import("@/lib/automation/rule-types").RuleConditionGroup;
  budget_adjustment_type: import("@/lib/automation/rule-types").BudgetAdjustmentType | null;
  budget_adjustment_value: number | null;
  bm_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsightsAdDaily {
  id: string;
  ad_account_id: string;
  date: string;
  campaign_id: string;
  campaign_name: string | null;
  adset_id: string;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  frequency: number | null;
  inline_link_clicks: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  results: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  ftd: number | null;
  cost_per_ftd: number | null;
  currency: string | null;
  synced_at: string;
}
