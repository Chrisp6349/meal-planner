// -----------------------------------------------------------------------
// household.js
// Auth + "household" (the two of you) bootstrapping for the meal planner.
//
// Data model:
//   householdMembers/{emailLower}  -> { householdId }
//   households/{householdId}       -> { name, memberEmails: [a, b], createdAt }
//     /weeks/{mondayDate}          -> one document per planned week
//     /shoppingList/{itemId}       -> shared shopping list items
//     /recipes/{recipeId}          -> saved recipes
//
// Every protected page calls requireHousehold() on load: it waits for
// sign-in, looks up which household this email belongs to, and either
// resolves with { user, householdId, household } or redirects — to
// index.html if signed out, to setup.html if signed in but not part of
// a household yet.
// -----------------------------------------------------------------------

import {
  auth, db, isConfigured, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, doc, getDoc, setDoc, serverTimestamp, collection
} from "./firebase-init.js";

export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

// Every page reload otherwise redoes two Firestore reads (householdMembers
// then households) just to re-confirm something that essentially never
// changes — noticeably slows down clicking between This Week / Shopping /
// Recipes / History. sessionStorage scopes the cache to "until this tab/
// app instance closes," which is a reasonable staleness window and
// naturally resets on the next fresh open.
const CACHE_KEY = "mp_household_cache_v1";

function readHouseholdCache(uid) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return cached.uid === uid ? cached : null;
  } catch {
    return null;
  }
}

function writeHouseholdCache(uid, householdId, household) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ uid, householdId, household }));
  } catch {
    // Safari private browsing etc. can throw on storage writes — fine to
    // just skip caching rather than fail the page over it.
  }
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, normalizeEmail(email), password);
}

export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

// Resolves once with { user, householdId, household }, or redirects and
// blocks forever (the returned promise never settles) if there's nothing
// more for the calling page to do.
//
// Has a timeout: if sign-in state or the Firestore reads never come
// back — a stuck/backgrounded tab that lost its connection is what this
// actually looks like, not just "slow" — this shows a real recovery
// screen with a one-tap reset instead of leaving the page blank forever.
export function requireHousehold() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      showNotConfigured();
      return;
    }
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      showLoadTimeoutError();
    }, 10000);

    onAuthStateChanged(auth, async (user) => {
      if (settled) return;
      if (!user) {
        settled = true;
        clearTimeout(timeoutId);
        window.location.href = "index.html";
        return;
      }

      const cached = readHouseholdCache(user.uid);
      if (cached) {
        settled = true;
        clearTimeout(timeoutId);
        resolve({ user, householdId: cached.householdId, household: cached.household });
        return;
      }

      try {
        const memberSnap = await getDoc(doc(db, "householdMembers", normalizeEmail(user.email)));
        if (settled) return;
        if (!memberSnap.exists()) {
          settled = true;
          clearTimeout(timeoutId);
          window.location.href = "setup.html";
          return;
        }
        const householdId = memberSnap.data().householdId;
        const householdSnap = await getDoc(doc(db, "households", householdId));
        if (settled) return;
        if (!householdSnap.exists()) {
          settled = true;
          clearTimeout(timeoutId);
          window.location.href = "setup.html";
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        const household = householdSnap.data();
        writeHouseholdCache(user.uid, householdId, household);
        resolve({ user, householdId, household });
      } catch (err) {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.error(err);
        showLoadTimeoutError();
      }
    });
  });
}

// Resolves once with the signed-in user, or redirects to index.html if
// signed out. Used by setup.html, which runs *before* a household exists
// so it can't use requireHousehold(). Same timeout/recovery treatment as
// requireHousehold() — sign-in state itself can just as easily get stuck.
export function requireUser() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      showNotConfigured();
      return;
    }
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      showLoadTimeoutError();
    }, 10000);

    onAuthStateChanged(auth, (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      resolve(user);
    });
  });
}

// Creates a new household containing exactly the signed-in user's email
// and their partner's email, then the two membership-lookup documents
// that point at it. Both partners' Firebase Auth accounts must already
// exist (created ahead of time in the Firebase console — see README) for
// the partner to ever be able to sign in and land on this same household,
// but the household record itself can be created by whichever of you
// sets things up first.
export async function createHousehold(myEmail, partnerEmail, name) {
  const me = normalizeEmail(myEmail);
  const partner = normalizeEmail(partnerEmail);
  if (!partner || partner === me) {
    throw new Error("Enter your partner's email address.");
  }
  const householdRef = doc(collection(db, "households"));
  await setDoc(householdRef, {
    name: name || "Our household",
    memberEmails: [me, partner],
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, "householdMembers", me), { householdId: householdRef.id });
  await setDoc(doc(db, "householdMembers", partner), { householdId: householdRef.id });
  return householdRef.id;
}

// Deletes every local trace of the app on this device — service worker,
// caches, IndexedDB, and local/session storage — then sends them back to
// sign in. This is the actual fix for "stuck, needs a restart": on iOS in
// particular, force-quitting the app doesn't clear any of this, since
// it's all tied to the site's origin rather than the home-screen icon.
export async function hardResetAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    }
    if ("indexedDB" in window && indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(d => new Promise((res) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = () => res();
      })));
    }
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {
    // Best-effort — reload regardless, since even a partial clear helps.
  }
  window.location.href = "index.html";
}

function showLoadTimeoutError() {
  document.body.innerHTML = `
    <div style="max-width:420px;margin:15vh auto 0;padding:32px;font-family:-apple-system,sans-serif;text-align:center;">
      <h2 style="margin:0 0 12px;font-size:20px;">Taking longer than expected</h2>
      <p style="color:#7A6A5A;font-size:14px;line-height:1.5;margin:0 0 24px;">
        This usually means some local data on this device got stuck. Resetting clears it and takes you back to sign in — you won't lose anything, since everything lives online.
      </p>
      <button id="hardResetBtn" style="padding:12px 24px;background:#C1592B;color:#fff;border:none;
        border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;">Reset and try again</button>
    </div>
  `;
  document.getElementById("hardResetBtn").addEventListener("click", hardResetAndReload);
}

function showNotConfigured() {
  document.body.innerHTML = `
    <div style="max-width:480px;margin:15vh auto;padding:32px;font-family:-apple-system,sans-serif;text-align:center;">
      <h2 style="margin:0 0 12px;">Firebase isn't configured yet</h2>
      <p style="color:#7A6A5A;font-size:14px;line-height:1.6;">
        Open <code>js/firebase-config.js</code> and paste in your Firebase project's config
        (see <code>README.md</code> for the full setup steps), then reload this page.
      </p>
    </div>`;
}
