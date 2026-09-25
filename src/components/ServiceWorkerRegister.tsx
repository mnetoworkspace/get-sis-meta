"use client";

import { useEffect } from "react";

// Registra o service worker sempre, independente do usuário ativar as
// notificações push — o Chrome só oferece instalar o app em modo standalone
// (sem barra de navegador) se houver um service worker registrado.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
