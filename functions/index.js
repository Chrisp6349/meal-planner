// -----------------------------------------------------------------------
// index.js
// One Cloud Function: fires on any write under households/{id}/* (the
// week plan, shopping list, or recipe box — pushTokens writes are
// skipped so registering a device doesn't notify anyone) and sends a
// push to every OTHER device registered for that household. "Other"
// means every token whose stored email doesn't match whoever made the
// change — see updatedBy/addedBy/createdBy stamped by the client.
// -----------------------------------------------------------------------

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { importRecipeFromUrl } = require("./recipe-import");

admin.initializeApp();
const db = admin.firestore();

// Update this if the GitHub Pages URL ever changes (custom domain, repo
// rename, etc.) — it's only used to build the "open this page" link on
// the notification, nothing else depends on it.
const SITE_URL = "https://chrisp6349.github.io/meal-planner";

exports.onHouseholdChange = onDocumentWritten(
  "households/{householdId}/{collectionId}/{docId}",
  async (event) => {
    const { householdId, collectionId } = event.params;
    if (collectionId === "pushTokens") return;

    const afterSnap = event.data.after;
    const beforeSnap = event.data.before;
    const after = afterSnap.exists ? afterSnap.data() : null;
    const before = beforeSnap.exists ? beforeSnap.data() : null;

    const actorEmail =
      (after && (after.updatedBy || after.addedBy || after.createdBy)) ||
      (before && (before.updatedBy || before.addedBy || before.createdBy)) ||
      null;

    let title, body, page;

    if (collectionId === "weeks") {
      title = "Meal plan updated";
      body = actorEmail ? `${actorEmail} updated this week's plan` : "This week's plan changed";
      page = "planner.html";
    } else if (collectionId === "shoppingList") {
      const itemText = (after && after.text) || (before && before.text) || "an item";
      if (!before) {
        body = `Added: ${itemText}`;
      } else if (!after) {
        body = `Removed: ${itemText}`;
      } else if (after.checked && !before.checked) {
        body = `Checked off: ${itemText}`;
      } else if (!after.checked && before.checked) {
        body = `Unchecked: ${itemText}`;
      } else {
        return; // e.g. a metadata-only write — nothing worth notifying about
      }
      title = "Shopping list";
      page = "shopping-list.html";
    } else if (collectionId === "recipes") {
      const recipeTitle = (after && after.title) || (before && before.title) || "a recipe";
      title = "Recipe box";
      body = !before
        ? `New recipe added: ${recipeTitle}`
        : !after
        ? `Recipe removed: ${recipeTitle}`
        : `Recipe updated: ${recipeTitle}`;
      page = "recipes.html";
    } else {
      return;
    }

    const tokensSnap = await db.collection("households").doc(householdId).collection("pushTokens").get();
    const tokens = tokensSnap.docs
      .filter((d) => !actorEmail || (d.data().email || "").toLowerCase() !== actorEmail.toLowerCase())
      .map((d) => d.id);

    if (!tokens.length) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        fcmOptions: { link: `${SITE_URL}/${page}` },
        notification: { icon: `${SITE_URL}/icons/icon-192.png` }
      }
    });

    // Prune tokens FCM says are dead (uninstalled, permission revoked)
    // so the household's token list doesn't accumulate stale entries.
    const stale = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          stale.push(tokens[i]);
        }
      }
    });
    if (stale.length) {
      const batch = db.batch();
      const col = db.collection("households").doc(householdId).collection("pushTokens");
      stale.forEach((t) => batch.delete(col.doc(t)));
      await batch.commit();
    }
  }
);

// Callable from the client (see js/recipes-data.js). Gated on being
// signed in at all rather than a specific household — this project only
// ever has the two of you as Firebase Auth users, so that's already
// equivalent to "a household member," and this function doesn't touch
// Firestore either way, just fetches+parses a page and hands the result
// back to whoever asked.
exports.importRecipeFromUrl = onCall({ region: "europe-west2", timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const url = ((request.data && request.data.url) || "").trim();
  if (!url) {
    throw new HttpsError("invalid-argument", "Missing a URL.");
  }
  try {
    return await importRecipeFromUrl(url);
  } catch (err) {
    throw new HttpsError("internal", err.message || "Couldn't import that recipe.");
  }
});
