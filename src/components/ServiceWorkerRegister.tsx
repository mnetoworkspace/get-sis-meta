"use client";

import { useEffect, useRef } from "react";

// Som customizado por tipo de notificação — só toca com o app aberto (em
// primeiro ou segundo plano). Com o app fechado/celular bloqueado não tem
// como fugir do som padrão do sistema ou silencioso: isso é limitação do
// próprio Web Push (nenhum navegador deixa escolher som pra notificação do
// SO), não dá pra contornar sem virar um app nativo de verdade.
const SOUND_BY_TYPE: Record<string, string> = {
  deposit: "/sounds/deposit.mp3",
};

// Registra o service worker sempre, independente do usuário ativar as
// notificações push — o Chrome só oferece instalar o app em modo standalone
// (sem barra de navegador) se houver um service worker registrado.
export function ServiceWorkerRegister() {
  const unlockedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // A maioria dos navegadores só deixa tocar áudio via JS depois de uma
    // interação do usuário na página — "destrava" isso na primeira
    // interação, tocando e pausando na hora, pra quando o push chegar de
    // verdade o play() não ser bloqueado silenciosamente.
    function unlockAudio() {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      const audio = new Audio();
      audio.muted = true;
      audio.play().catch(() => {});
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    }
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "push-sound") return;
      const src = SOUND_BY_TYPE[event.data.notificationType];
      if (!src) return;
      new Audio(src).play().catch(() => {
        // Navegador bloqueou autoplay (sem interação prévia na página
        // ainda) — a notificação do sistema já tocou o som padrão dela
        // mesmo, então não é um estado quebrado, só sem o som extra.
      });
    }
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
