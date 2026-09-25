"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { urlBase64ToUint8Array } from "@/lib/push/client";

// Chave VAPID pública — por definição não é secreta (é enviada pro navegador
// de todo mundo que ativa notificação; só a VAPID_PRIVATE_KEY é sensível).
// Fallback fixo aqui pra não depender de a plataforma de deploy propagar
// variáveis NEXT_PUBLIC_* pro build da imagem Docker — se a env var existir
// no ambiente de build, ela tem prioridade; senão cai nesse valor.
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BIBj5uyKHhvrZs9FdSN34Gozzh02mezr1UK3HuzIes4SWk1ObDBmluxNYxXvo9wWx4k4kAL_QT2HyhwdcYie4uQ";

async function subscribeAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Erro ao ativar notificações");
}

async function unsubscribeAction(endpoint: string) {
  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Erro ao desativar notificações");
}

async function checkAction(endpoint: string): Promise<boolean> {
  const res = await fetch(`/api/push/check?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) return false;
  return (await res.json()).subscribed === true;
}

export function PushNotificationToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(text: string) {
    setMessage(text);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setMessage(null), 4000);
  }

  useEffect(() => {
    async function init() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
        setSupported(false);
        setChecking(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        const activeForThisClient = sub ? await checkAction(sub.endpoint) : false;
        setEnabled(activeForThisClient);
      } catch {
        setSupported(false);
      } finally {
        setChecking(false);
      }
    }
    init();
  }, []);

  async function handleToggle() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      if (enabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribeAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setEnabled(false);
        flash("Notificações desativadas");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        flash("Permissão de notificação negada pelo navegador");
        return;
      }

      // Uma inscrição do navegador assinada com uma applicationServerKey
      // antiga (ex: de antes de uma rotação de chave VAPID) faz o subscribe()
      // abaixo falhar — o navegador não troca a chave sozinho, exige
      // unsubscribe explícito antes. Limpa qualquer inscrição residual antes
      // de assinar de novo.
      const staleSub = await reg.pushManager.getSubscription();
      if (staleSub) await staleSub.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
      });

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Inscrição de push inválida");
      }

      await subscribeAction({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });

      setEnabled(true);
      flash("Notificações ativadas");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Erro ao configurar notificações");
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  const busy = checking || loading;
  const Icon = busy ? Loader2 : enabled ? Bell : BellOff;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        aria-label={enabled ? "Desativar notificações" : "Ativar notificações"}
        title={enabled ? "Notificações de depósito ativadas" : "Ativar notificações de depósito"}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] disabled:opacity-50"
      >
        <Icon size={15} className={busy ? "animate-spin" : ""} />
      </button>
      {message && (
        <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text)] shadow-xl">
          {message}
        </div>
      )}
    </div>
  );
}
