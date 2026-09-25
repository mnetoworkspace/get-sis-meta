"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";

interface NotificationSettings {
  deposit_enabled: boolean;
  deposit_silent: boolean;
  deposit_silence_enabled: boolean;
  deposit_silence_silent: boolean;
  rules_enabled: boolean;
  rules_silent: boolean;
  account_status_enabled: boolean;
  account_status_silent: boolean;
}

interface CategoryConfig {
  enabledKey: keyof NotificationSettings;
  silentKey: keyof NotificationSettings;
  title: string;
  description: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    enabledKey: "deposit_enabled",
    silentKey: "deposit_silent",
    title: "Novo depósito",
    description: "Avisa a cada depósito confirmado.",
  },
  {
    enabledKey: "deposit_silence_enabled",
    silentKey: "deposit_silence_silent",
    title: "Silêncio de depósitos",
    description: "Avisa quando passa um tempo sem nenhum depósito novo — possível problema no gateway.",
  },
  {
    enabledKey: "rules_enabled",
    silentKey: "rules_silent",
    title: "Regras de automação",
    description: "Avisa quando uma regra pausa, ativa ou ajusta orçamento de campanha/conjunto/anúncio.",
  },
  {
    enabledKey: "account_status_enabled",
    silentKey: "account_status_silent",
    title: "Status de conta e BM",
    description:
      "Avisa quando uma conta sai do status ativo (bloqueada, em revisão, fechada) ou volta a ficar ativa — e quando uma Business Manager inteira para de responder (possível bloqueio da BM).",
  },
];

export default function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-settings")
      .then((r) => r.json())
      .then((json) => setSettings(json.data))
      .catch(() => setMessage("Falha ao carregar configurações."));
  }, []);

  async function updateField(field: keyof NotificationSettings, value: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [field]: value });
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/notification-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Falha ao salvar");
      }
    } catch (err) {
      setSettings(previous);
      setMessage(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80 backdrop-blur">
        <div className="page-shell max-w-3xl flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo-rakebet-icon.png" alt="Rakebet" width={32} height={32} className="rounded-lg" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Notificações</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] sm:px-3.5"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">Voltar ao dashboard</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="page-shell max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        {message && (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
            {message}
          </div>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          Escolha quais tipos de notificação push você quer receber, e se cada uma toca o som padrão do
          aparelho ou fica silenciosa. O Web Push não permite um som customizado por tipo — só
          silenciosa ou o som padrão.
        </p>

        {!settings ? (
          <p className="text-sm text-[var(--text-muted)]">Carregando...</p>
        ) : (
          <section className="card divide-y divide-[var(--border)] p-0">
            {CATEGORIES.map((cat) => {
              const enabled = settings[cat.enabledKey];
              const silent = settings[cat.silentKey];
              return (
                <div key={cat.enabledKey} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{cat.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{cat.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={saving}
                        onChange={(e) => updateField(cat.enabledKey, e.target.checked)}
                      />
                      Ativado
                    </label>
                    <label className={`flex items-center gap-2 text-sm ${enabled ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                      <input
                        type="checkbox"
                        checked={silent}
                        disabled={saving || !enabled}
                        onChange={(e) => updateField(cat.silentKey, e.target.checked)}
                      />
                      Silenciosa
                    </label>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
