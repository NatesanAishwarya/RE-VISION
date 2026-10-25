import type { Experiment, ExperimentData, ExperimentSummary } from "../types/experiment";
import type { Failure } from "./failures";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(method: string, url: string, body?: unknown, raw?: { blob: Blob }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method, credentials: "same-origin",
      headers: raw ? { "Content-Type": raw.blob.type || "application/octet-stream" } : body !== undefined ? { "Content-Type": "application/json" } : {},
      body: raw ? raw.blob : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the RE:VISION server. Is it running? (npm run dev starts both parts.)", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((json as { error?: string }).error ?? `Request failed (${res.status}).`, res.status);
  return json as T;
}

export type GalleryItem = {
  id: string; experimentId: string; createdAt: string; kind: string; note: string; owner: string;
  experimentTitle: string; modelLabel: string; imageHash: string; data: Failure;
};

export const api = {
  me: () => call<{ username: string | null }>("GET", "/api/auth/me"),
  login: (username: string, password: string) => call<{ username: string }>("POST", "/api/auth/login", { username, password }),
  register: (username: string, password: string) => call<{ username: string }>("POST", "/api/auth/register", { username, password }),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout", {}),
  list: () => call<ExperimentSummary[]>("GET", "/api/experiments"),
  get: (id: string) => call<Experiment>("GET", `/api/experiments/${id}`),
  imageUrl: (id: string) => `/api/experiments/${id}/image`,
  setShared: (id: string, shared: boolean) => call<{ ok: true }>("PATCH", `/api/experiments/${id}`, { shared }),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/api/experiments/${id}`),
  gallery: () => call<GalleryItem[]>("GET", "/api/gallery"),
  pin: (experimentId: string, f: Failure, note: string) => call<{ id: string }>("POST", "/api/gallery", { experimentId, kind: f.kind, note, data: f }),
  unpin: (id: string) => call<{ ok: true }>("DELETE", `/api/gallery/${id}`),
};

/** Creates the experiment record, then uploads its image. If the upload fails the record is removed again. */
export async function saveExperiment(summary: Omit<ExperimentSummary, "id" | "owner" | "shared" | "createdAt">, data: ExperimentData, image: Blob, shared: boolean) {
  const { id } = await call<{ id: string }>("POST", "/api/experiments", { summary, data, shared });
  try { await call("PUT", `/api/experiments/${id}/image`, undefined, { blob: image }); }
  catch (e) { await api.remove(id).catch(() => {}); throw e; }
  return id;
}
