// -----------------------------------------------------------------------
// firebase-init.js
// Boots Firebase for the meal planner and exports the pieces every other
// module needs. Uses the hosted modular SDK straight from a CDN — no
// build step, works from plain Firebase Hosting the same way the rest of
// this repo does.
// -----------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  collection, getDocs, addDoc, query, where, orderBy, limit, documentId,
  onSnapshot, serverTimestamp, enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { firebaseConfig, isConfigured } from "./firebase-config.js";

export { isConfigured };

let app, auth, db;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (!isSafari) {
    enableMultiTabIndexedDbPersistence(db).catch(() => {});
  }
}
export { auth, db };

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  collection, getDocs, addDoc, query, where, orderBy, limit, documentId, onSnapshot, serverTimestamp
};
