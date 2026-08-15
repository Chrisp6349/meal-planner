// -----------------------------------------------------------------------
// firebase-messaging-sw.js
// Background push handler — this is what lets a notification show up
// even when the app isn't open in a tab. Firebase requires this exact
// filename at the site root; it has to be a plain classic script (no ES
// modules), which is why the config below is duplicated from
// js/firebase-config.js rather than imported — keep the two in sync if
// you ever change Firebase projects.
// -----------------------------------------------------------------------

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCOaf3K6xe66oHr5lb73kPAws_Qn5yv9yE",
  authDomain: "meal-planner-e11bc.firebaseapp.com",
  projectId: "meal-planner-e11bc",
  storageBucket: "meal-planner-e11bc.firebasestorage.app",
  messagingSenderId: "796521182370",
  appId: "1:796521182370:web:f59e8a74a4a5244a7813fb"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const url = (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.url) || "./planner.html";
  self.registration.showNotification(title || "Meal Planner", {
    body: body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { url }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./planner.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(new URL(url, self.location.href).pathname) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
