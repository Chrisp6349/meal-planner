// -----------------------------------------------------------------------
// PASTE YOUR FIREBASE CONFIG HERE
// -----------------------------------------------------------------------
// See README.md in this repo for the full setup steps (create the
// Firebase project, enable Auth + Firestore, add your two accounts,
// deploy the rules in this folder).
//
// Firebase console -> Project settings -> your web app -> "SDK setup and
// configuration" -> Config. Copy the whole object and replace the one
// below.
// -----------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyCOaf3K6xe66oHr5lb73kPAws_Qn5yv9yE",
  authDomain: "meal-planner-e11bc.firebaseapp.com",
  projectId: "meal-planner-e11bc",
  storageBucket: "meal-planner-e11bc.firebasestorage.app",
  messagingSenderId: "796521182370",
  appId: "1:796521182370:web:f59e8a74a4a5244a7813fb"
};

// Set to true automatically once the placeholder above has been replaced.
export const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

// Optional: only needed for push notifications. Firebase console ->
// Project settings -> Cloud Messaging -> Web configuration -> "Generate
// key pair" (under "Web Push certificates"). Push notifications stay
// silently unavailable (the bell icon just won't appear) until this is
// filled in — nothing else in the app depends on it.
export const vapidKey = "YOUR_VAPID_KEY";
export const isPushConfigured = vapidKey !== "YOUR_VAPID_KEY";
