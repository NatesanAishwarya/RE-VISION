import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function firebaseAdmin() {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (error) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain the Firebase service-account JSON.", { cause: error });
  }
  return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
}

export async function verifyFirebaseRequest(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error("Sign in to continue."), { status: 401 });
  const auth = getAuth(firebaseAdmin());
  try {
    return await auth.verifyIdToken(token);
  } catch {
    throw Object.assign(new Error("Your sign-in has expired. Sign in again."), { status: 401 });
  }
}

export async function readExperiment(id) {
  return getFirestore(firebaseAdmin()).collection("experiments").doc(id).get();
}

export function sendApiError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json(
    { error: status === 500 ? "Something went wrong while accessing saved files." : error.message },
    { status },
  );
}
