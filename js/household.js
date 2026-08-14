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
export function requireHousehold() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      showNotConfigured();
      return;
    }
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      try {
        const memberSnap = await getDoc(doc(db, "householdMembers", normalizeEmail(user.email)));
        if (!memberSnap.exists()) {
          window.location.href = "setup.html";
          return;
        }
        const householdId = memberSnap.data().householdId;
        const householdSnap = await getDoc(doc(db, "households", householdId));
        if (!householdSnap.exists()) {
          window.location.href = "setup.html";
          return;
        }
        resolve({ user, householdId, household: householdSnap.data() });
      } catch (err) {
        console.error(err);
        document.body.innerHTML = `<div style="max-width:420px;margin:15vh auto;padding:32px;font-family:sans-serif;text-align:center;">
          <h2>Something went wrong loading your household</h2>
          <p style="color:#7A6A5A;font-size:14px;">${(err && err.message) || err}</p>
          <a href="index.html" style="color:#C1592B;">Back to sign in</a></div>`;
      }
    });
  });
}

// Resolves once with the signed-in user, or redirects to index.html if
// signed out. Used by setup.html, which runs *before* a household exists
// so it can't use requireHousehold().
export function requireUser() {
  return new Promise((resolve) => {
    if (!isConfigured) {
      showNotConfigured();
      return;
    }
    onAuthStateChanged(auth, (user) => {
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
