// -----------------------------------------------------------------------
// push.js
// Push notifications: "the other person's phone buzzes when something
// changes" — the shared week plan, shopping list, or recipe box. This
// file only handles the client side (asking permission, getting an FCM
// token, saving it); the actual sending happens in a Cloud Function
// (functions/index.js) that fires on Firestore writes and is deployed
// separately — see README.md.
//
// iOS quirk worth knowing: Safari only exposes the Notification API to
// a site that's been "Add to Home Screen"-ed — a normal browser tab
// can't ask for permission at all, even on iOS 16.4+. isIosNotInstalled()
// below is how the UI tells that case apart from "just not supported".
// -----------------------------------------------------------------------

import { app, db, doc, setDoc, serverTimestamp } from "./firebase-init.js";
import { isPushConfigured, vapidKey } from "./firebase-config.js";

function isIos() {
  return /iP(hone|od|ad)/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.navigator.standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
}

// Whether this browser/context can even attempt push, and if not, why —
// the UI uses `reason` to show the right nudge instead of just hiding.
export function pushAvailability() {
  if (!isPushConfigured) return { available: false, reason: "not-configured" };
  if (isIos() && !isStandalone()) return { available: false, reason: "ios-not-installed" };
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { available: false, reason: "unsupported" };
  }
  return { available: true, reason: null };
}

export function notificationPermission() {
  return ("Notification" in window) ? Notification.permission : "unsupported";
}

// Asks for permission (if not already decided), gets an FCM token, and
// saves it under the household so the Cloud Function knows where to
// send notifications. Safe to call again later — the token doc is keyed
// by the token itself, so re-registering just overwrites the same doc.
export async function enablePush(householdId, email) {
  const { getMessaging, getToken } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied"
      ? "Notifications are blocked for this site — check your browser/phone settings to allow them."
      : "Notifications weren't enabled.");
  }

  const registration = await navigator.serviceWorker.register("firebase-messaging-sw.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Couldn't get a notification token — try again.");

  await setDoc(doc(db, "households", householdId, "pushTokens", token), {
    email: email.toLowerCase(),
    token,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp()
  });

  return token;
}
