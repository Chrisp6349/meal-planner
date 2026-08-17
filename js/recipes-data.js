// -----------------------------------------------------------------------
// recipes-data.js
// Firestore helpers for the shared recipe box — used by recipes.html,
// recipe.html, and the "attach a recipe" picker on the weekly planner.
// -----------------------------------------------------------------------

import {
  db, functions, httpsCallable, collection, doc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp
} from "./firebase-init.js";

function recipesCol(householdId) {
  return collection(db, "households", householdId, "recipes");
}

export async function listRecipes(householdId) {
  const snap = await getDocs(query(recipesCol(householdId), orderBy("title")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getRecipe(householdId, recipeId) {
  const snap = await getDoc(doc(db, "households", householdId, "recipes", recipeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addRecipe(householdId, { title, body, sourceUrl }, userEmail) {
  const ref = await addDoc(recipesCol(householdId), {
    title: title.trim(),
    body: body.trim(),
    sourceUrl: (sourceUrl || "").trim(),
    createdAt: serverTimestamp(),
    createdBy: userEmail || ""
  });
  return ref.id;
}

export async function deleteRecipe(householdId, recipeId) {
  await deleteDoc(doc(db, "households", householdId, "recipes", recipeId));
}

// Fetches a recipe page server-side (via the importRecipeFromUrl Cloud
// Function) and pulls out its title/ingredients/method from the page's
// own structured recipe data — works for most major recipe sites, not
// just one. Returns { title, body } to pre-fill the add-recipe form for
// review; never saves anything on its own.
export async function importRecipeFromUrl(url) {
  const callable = httpsCallable(functions, "importRecipeFromUrl");
  const res = await callable({ url });
  return res.data;
}
