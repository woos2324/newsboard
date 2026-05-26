self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Newsboard", {
      body: data.body ?? "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url ?? "/admin/users" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/admin/users";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && "focus" in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
