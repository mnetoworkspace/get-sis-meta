// Sem cache/offline proposital — é um painel de dados ao vivo, não faz
// sentido servir uma versão velha. O listener existe só porque o Chrome
// exige um service worker com handler de fetch pra considerar o app
// instalável (critério de "Add to Home Screen" em modo standalone).
self.addEventListener("fetch", () => {});

// Precisa bater com SOUND_BY_TYPE em ServiceWorkerRegister.tsx — tipos de
// notificação que têm som customizado tocando via página aberta. Só serve
// pra decidir se silencia a notificação do SISTEMA quando tem aba aberta
// (evita tocar o som padrão JUNTO com o customizado); sem aba aberta o
// som padrão do sistema continua tocando normal, não tem como fugir disso.
const TYPES_WITH_CUSTOM_SOUND = ["deposit"];

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Rakebet", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Rakebet";
  const requestedSilent = data.silent === true;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const hasOpenClient = clientList.length > 0;
      const hasCustomSound = !requestedSilent && TYPES_WITH_CUSTOM_SOUND.includes(data.type);
      // Com cliente aberto e som customizado disponível, silencia a
      // notificação do sistema pra não tocar os dois sons juntos — o
      // customizado (via postMessage abaixo) substitui o padrão nesse caso.
      const systemSilent = requestedSilent || (hasOpenClient && hasCustomSound);

      const options = {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        // Web Push não permite escolher um ARQUIVO de som — só silenciosa
        // (true) ou o som padrão do aparelho (false). O som customizado de
        // verdade só acontece via postMessage pra página, abaixo.
        silent: systemSilent,
        data: { url: data.url || "/" },
      };

      const tasks = [self.registration.showNotification(title, options)];
      if (hasCustomSound) {
        for (const client of clientList) {
          client.postMessage({ type: "push-sound", notificationType: data.type });
        }
      }
      return Promise.all(tasks);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
