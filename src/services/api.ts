import type { Experiment, ExperimentData, ExperimentSummary } from "../types/experiment";
import type { Failure } from "./failures";
import { createUserWithEmailAndPassword, deleteUser, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { requireFirebase } from "./firebase";
import { upload } from "@vercel/blob/client";

const usernameEmail = (username: string) => {
  const encoded = Array.from(new TextEncoder().encode(username.toLowerCase()), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${encoded}@revision.invalid`;
};
const profilePath = (uid: string) => doc(requireFirebase().db, "users", uid);

function waitForAuth() {
  const { auth } = requireFirebase();
  return new Promise<User | null>((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, (user) => { unsubscribe(); resolve(user); });
  });
}

async function currentUser() {
  const { auth } = requireFirebase();
  const user = auth.currentUser ?? await waitForAuth();
  if (!user) throw new Error("Sign in to continue.");
  return user;
}

async function firebaseToken() {
  return (await currentUser()).getIdToken();
}

async function blobCall(url: string, method: "GET" | "POST", body?: unknown) {
  const token = await firebaseToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error((result as { error?: string }).error ?? `File storage request failed (${response.status}).`);
  }
  return response;
}

async function uploadPrivateBlob(pathname: string, blob: Blob, token: string) {
  return upload(pathname, blob, {
    access: "private",
    contentType: blob.type || "application/octet-stream",
    handleUploadUrl: "/api/blob-upload",
    headers: { Authorization: `Bearer ${token}` },
    multipart: true,
  });
}

async function usernameFor(user: User) {
  const snapshot = await getDoc(profilePath(user.uid));
  const username = snapshot.data()?.username;
  if (typeof username !== "string") throw new Error("Your account profile is missing. Contact the site administrator.");
  return username;
}

async function visibleExperiment(id: string) {
  const { db } = requireFirebase();
  const user = await currentUser();
  const snapshot = await getDoc(doc(db, "experiments", id));
  if (!snapshot.exists()) throw new Error("Experiment not found.");
  const data = snapshot.data();
  if (data.ownerId !== user.uid && data.shared !== true) throw new Error("Experiment not found.");
  return { snapshot, data, user };
}

async function deleteInBatches(ids: string[]) {
  const { db } = requireFirebase();
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i + 450).forEach((id) => batch.delete(doc(db, "gallery", id)));
    await batch.commit();
  }
}

async function updateGallerySharing(ids: string[], shared: boolean) {
  const { db } = requireFirebase();
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i + 450).forEach((id) => batch.update(doc(db, "gallery", id), { shared }));
    await batch.commit();
  }
}

export type GalleryItem = {
  id: string; experimentId: string; createdAt: string; kind: string; note: string; owner: string;
  experimentTitle: string; modelLabel: string; imageHash: string; data: Failure;
};

export const api = {
  me: async () => {
    const { auth } = requireFirebase();
    const user = auth.currentUser ?? await waitForAuth();
    return { username: user ? await usernameFor(user) : null };
  },
  login: async (username: string, password: string) => {
    const { auth } = requireFirebase();
    const credential = await signInWithEmailAndPassword(auth, usernameEmail(username), password);
    return { username: await usernameFor(credential.user) };
  },
  register: async (username: string, password: string) => {
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) throw new Error("Username must be 3 to 32 characters: letters, numbers, dot, dash or underscore.");
    if (password.length < 8 || password.length > 200) throw new Error("Password must be at least 8 characters.");
    const { auth, db } = requireFirebase();
    const credential = await createUserWithEmailAndPassword(auth, usernameEmail(username), password);
    try {
      await setDoc(doc(db, "users", credential.user.uid), { username, createdAt: serverTimestamp() });
    } catch (error) {
      try { await deleteUser(credential.user); }
      catch (cleanupError) { console.error("Could not remove a Firebase account after profile creation failed:", cleanupError); await signOut(auth); }
      throw error;
    }
    return { username };
  },
  logout: async () => { await signOut(requireFirebase().auth); return { ok: true as const }; },
  list: async () => {
    const { db } = requireFirebase();
    const user = await currentUser();
    const items = await Promise.all([
      getDocs(query(collection(db, "experiments"), where("shared", "==", true))),
      getDocs(query(collection(db, "experiments"), where("ownerId", "==", user.uid))),
    ]);
    const rows = new Map<string, ExperimentSummary>();
    for (const snapshot of items) for (const entry of snapshot.docs) {
      const data = entry.data();
      rows.set(entry.id, { ...data, id: entry.id, createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString() } as ExperimentSummary);
    }
    return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
  },
  get: async (id: string) => {
    const { snapshot, data } = await visibleExperiment(id);
    const response = await blobCall(`/api/blob?id=${encodeURIComponent(id)}&file=data`, "GET");
    const file = await response.blob();
    const experimentData = JSON.parse(await file.text()) as ExperimentData;
    return { ...data, ...experimentData, id: snapshot.id, createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString() } as Experiment;
  },
  imageBlob: async (id: string) => {
    const response = await blobCall(`/api/blob?id=${encodeURIComponent(id)}&file=image`, "GET");
    return response.blob();
  },
  setShared: async (id: string, shared: boolean) => {
    const { db } = requireFirebase();
    const user = await currentUser();
    const snapshot = await getDoc(doc(db, "experiments", id));
    if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) throw new Error("Experiment not found, or it is not yours.");
    await updateDoc(snapshot.ref, { shared });
    const linked = await getDocs(query(collection(db, "gallery"), where("experimentId", "==", id)));
    await updateGallerySharing(linked.docs.map((entry) => entry.id), shared);
    return { ok: true as const };
  },
  remove: async (id: string) => {
    const { db } = requireFirebase();
    const user = await currentUser();
    const snapshot = await getDoc(doc(db, "experiments", id));
    if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) throw new Error("Experiment not found, or it is not yours.");
    const linked = await getDocs(query(collection(db, "gallery"), where("experimentId", "==", id)));
    await blobCall("/api/blob", "POST", { operation: "delete", id });
    await deleteInBatches(linked.docs.map((entry) => entry.id));
    await deleteDoc(snapshot.ref);
    return { ok: true as const };
  },
  gallery: async () => {
    const { db } = requireFirebase();
    const user = await currentUser();
    const [shared, own] = await Promise.all([
      getDocs(query(collection(db, "gallery"), where("shared", "==", true))),
      getDocs(query(collection(db, "gallery"), where("ownerId", "==", user.uid))),
    ]);
    const rows = new Map<string, GalleryItem>();
    for (const snapshot of [...shared.docs, ...own.docs]) {
      const data = snapshot.data();
      rows.set(snapshot.id, { ...data, id: snapshot.id, createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString() } as GalleryItem);
    }
    return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500);
  },
  pin: async (experimentId: string, f: Failure, note: string) => {
    const { db } = requireFirebase();
    const { data, user } = await visibleExperiment(experimentId);
    const id = crypto.randomUUID();
    await setDoc(doc(db, "gallery", id), {
      id, experimentId, createdAt: serverTimestamp(), kind: f.kind, note: note.slice(0, 300),
      ownerId: user.uid, owner: await usernameFor(user), shared: data.shared === true,
      experimentTitle: data.title, modelLabel: data.modelLabel, imageHash: data.imageHash, data: f,
    });
    return { id };
  },
  unpin: async (id: string) => {
    const { db } = requireFirebase();
    const user = await currentUser();
    const item = doc(db, "gallery", id);
    const snapshot = await getDoc(item);
    if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) throw new Error("Item not found, or it is not yours.");
    await deleteDoc(item);
    return { ok: true as const };
  },
};

export async function saveExperiment(summary: Omit<ExperimentSummary, "id" | "owner" | "shared" | "createdAt">, data: ExperimentData, image: Blob, shared: boolean) {
  const { db } = requireFirebase();
  const user = await currentUser();
  const profile = await usernameFor(user);
  const id = crypto.randomUUID();
  const imagePath = `experiments/${user.uid}/${id}/image`;
  const dataPath = `experiments/${user.uid}/${id}/data.json`;
  await setDoc(doc(db, "experiments", id), {
    ...summary, owner: profile, ownerId: user.uid, shared, imagePath, dataPath, createdAt: serverTimestamp(),
  });
  try {
    const token = await user.getIdToken();
    await uploadPrivateBlob(imagePath, image, token);
    await uploadPrivateBlob(dataPath, new Blob([JSON.stringify(data)], { type: "application/json" }), token);
  } catch (error) {
    const cleanup = await Promise.allSettled([
      blobCall("/api/blob", "POST", { operation: "delete", id }),
      deleteDoc(doc(db, "experiments", id)),
    ]);
    cleanup.filter((result) => result.status === "rejected").forEach((result) => console.error("Could not clean up an incomplete experiment save:", result.reason));
    throw error;
  }
  return id;
}
