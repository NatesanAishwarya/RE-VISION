import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(config).every(Boolean);

const app = isFirebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? initializeFirestore(app, { ignoreUndefinedProperties: true }) : null;

export function requireFirebase() {
  if (!auth || !db) {
    throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* settings from your Firebase web app to the environment.");
  }
  return { auth, db };
}
