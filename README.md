# Meal Planner

A small weekly meal planner for the two of you: a Monday–Sunday plan, a
shared shopping list, saved recipes (paste one in and attach it to any
day), and a history of past weeks. It's a static site (no build step)
backed by its own Firebase project — its own repo entirely, kept
deliberately separate from any work projects, so none of your personal
data ever touches work infrastructure or billing.

## 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   click **Add project**. Give it any name (e.g. "our-meal-planner"). The
   free "Spark" plan is enough for this.
2. Once it's created, click the **</>** (web) icon to register a web app.
   You don't need Firebase Hosting set up at this point — just get the
   app registered so you're given a config object.
3. Copy the `firebaseConfig` object it shows you.

## 2. Turn on Authentication

1. In the Firebase console, go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Go to the **Users** tab and click **Add user** — do this twice, once
   for each of you, with an email and password each of you will sign in
   with. There's no self-signup screen in this app on purpose; accounts
   are created here, once, by hand.

## 3. Turn on Firestore

1. Go to **Build → Firestore Database → Create database**.
2. Pick any region close to you, and start in **production mode** (the
   rules in `firestore.rules` handle access control — you don't need
   "test mode").

## 4. Add your config to the app

Open `js/firebase-config.js` and replace the placeholder object with the
one you copied in step 1:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 5. Deploy the Firestore rules

You'll need the [Firebase CLI](https://firebase.google.com/docs/cli)
installed (`npm install -g firebase-tools`) and signed in (`firebase
login`). Then, from the repo root:

```bash
firebase use --add        # pick the project you created in step 1
firebase deploy --only firestore:rules
```

## 6. Deploy the site

Easiest option is Firebase Hosting, using the same CLI:

```bash
firebase deploy --only hosting
```

That prints a `https://<your-project>.web.app` URL — that's the app.
Bookmark it (or "Add to Home Screen" on your phones) and sign in with
the two accounts you created in step 2.

Any static host works too, if you'd rather use something else (GitHub
Pages, Netlify, Vercel, …) — this repo is entirely self-contained
static HTML/CSS/JS, nothing Firebase-specific about the hosting beyond
`firebase.json`.

## 7. First sign-in: set up your household

Whichever of you signs in first will land on a "Set up your household"
screen — give it a name and enter your partner's email address. That
creates the shared household both accounts will use for the planner,
shopping list, and recipes. Your partner doesn't need to do anything for
this — the next time *they* sign in, they'll already be part of it.

## How it's organised

- `planner.html` — the Monday–Sunday view. Use the arrows to move
  between weeks; typing in a day's box autosaves after a short pause.
  "Attach a recipe" on a day lets you pick a saved recipe or paste in a
  new one on the spot.
- `shopping-list.html` — a shared, live-updating list. Whatever either of
  you adds or checks off shows up for the other immediately.
- `recipes.html` / `recipe.html` — the recipe box: paste a title and the
  recipe text (ingredients, method, however you have it), optionally with
  a source link, and it's saved for reuse on any future day. Or use
  **"Import from a link"** to skip typing entirely — paste a recipe page's
  URL and it fetches the title/ingredients/method for you to review
  before saving. Works for most major recipe sites (it reads the same
  structured data those sites embed for Google's recipe search results);
  falls back to a friendly error for sites that don't have it, and you
  paste manually instead. Needs the Cloud Function deployed — see
  section 8 below, same `firebase deploy --only functions` command
  picks up this function too, no separate step.
- `history.html` — every week you've planned, most recent first, with a
  quick summary of what was on. Click through to see (or edit) any past
  week in full.

Everything is scoped to your household by email address — see
`firestore.rules` for exactly how access is controlled. There's no admin
role, no other users: just the two emails on the household record.

## 8. Push notifications (optional)

Lets each of you get a real notification — buzzes the phone even with
the app closed — when the other one changes the week plan, shopping
list, or recipe box. This is the one part of the setup that needs a bit
more than the Firebase console.

**a. Upgrade to the Blaze plan.** Sending notifications runs through a
Cloud Function, and Firebase won't deploy any Cloud Function on the free
Spark plan. This is **per project** — if you're on Blaze elsewhere for
something else, that doesn't carry over here. In the Firebase console,
bottom-left corner shows your current plan; click **Upgrade** and switch
to **Blaze**. For two people's usage this stays firmly within Blaze's
free monthly quota — expect $0 actual cost — but Firebase does require a
card on file to enable it at all.

**b. Generate a Web Push key.** Project settings (gear icon, top of the
left sidebar) → **Cloud Messaging** tab → under **Web configuration**,
click **Generate key pair**. Copy the key it shows you.

**c. Add it to the app.** Open `js/firebase-config.js` and replace:

```js
export const vapidKey = "YOUR_VAPID_KEY";
```

with the key from step b, then commit and push (or deploy) that change.

**d. Deploy the Cloud Function.** This needs the Firebase CLI on a
computer (not just the console):

```bash
npm install -g firebase-tools   # if you don't already have it
firebase login
firebase use --add              # pick this project, once
firebase deploy --only functions
```

**e. Turn it on in the app.** Open the app and tap the bell icon in the
top bar. On iPhone, this only works once the app has been **added to
your Home Screen** (Safari → Share → Add to Home Screen) — a plain
Safari tab can't ask for notification permission at all; tapping the
bell before that will tell you as much. Do this once on each of your
phones.

That's it from then on — any change either of you makes fires a
notification to the other's phone(s), tapping it opens straight to the
relevant page.
