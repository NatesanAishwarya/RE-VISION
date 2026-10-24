import type { SavedRun } from "../types/experiment";

const S = "runs";
const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open("revision", 1);
  r.onupgradeneeded = () => r.result.createObjectStore(S, { keyPath: "id" });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const r = f(db.transaction(S, mode).objectStore(S));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
};
export const saveRun = (r: SavedRun) => tx("readwrite", (s) => s.put(r));
export const deleteRun = (id: string) => tx("readwrite", (s) => s.delete(id));
export const listRuns = async () =>
  (await tx("readonly", (s) => s.getAll() as IDBRequest<SavedRun[]>)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
