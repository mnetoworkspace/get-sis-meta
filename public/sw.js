// Sem cache/offline proposital — é um painel de dados ao vivo, não faz
// sentido servir uma versão velha. O listener existe só porque o Chrome
// exige um service worker com handler de fetch pra considerar o app
// instalável (critério de "Add to Home Screen" em modo standalone).
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Traffic RakeBet", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Traffic RakeBet";
  const options = {
    body: data.body || "",
    icon: "/logo-rakebet-icon.png",
    badge: "/logo-rakebet-icon.png",
    // Web Push não permite som customizado — só silenciosa (true) ou o som
    // padrão do aparelho (false/omitido).
    silent: data.silent === true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
