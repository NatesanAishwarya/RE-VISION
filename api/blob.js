import { del, get } from "@vercel/blob";
import { readExperiment, sendApiError, verifyFirebaseRequest } from "../server/firebase-admin.mjs";

export default async function handler(request) {
  try {
    const user = await verifyFirebaseRequest(request);
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id") ?? "";
      const file = url.searchParams.get("file");
      if (!/^[0-9a-f-]{36}$/i.test(id) || (file !== "image" && file !== "data")) {
        return Response.json({ error: "Invalid file request." }, { status: 400 });
      }
      const experiment = await readExperiment(id);
      const item = experiment.data();
      if (!experiment.exists || (item?.ownerId !== user.uid && item?.shared !== true)) {
        return Response.json({ error: "Experiment not found." }, { status: 404 });
      }
      const pathname = file === "image" ? item.imagePath : item.dataPath;
      if (typeof pathname !== "string") return Response.json({ error: "Saved file not found." }, { status: 404 });
      const blob = await get(pathname, { access: "private" });
      if (!blob || blob.statusCode !== 200) return Response.json({ error: "Saved file not found." }, { status: 404 });
      return new Response(blob.stream, {
        headers: {
          "Content-Type": blob.blob.contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (body.operation !== "delete" || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
        return Response.json({ error: "Invalid delete request." }, { status: 400 });
      }
      const experiment = await readExperiment(body.id);
      const item = experiment.data();
      if (!experiment.exists || item?.ownerId !== user.uid) {
        return Response.json({ error: "Experiment not found, or it is not yours." }, { status: 404 });
      }
      const paths = [item.imagePath, item.dataPath].filter((path) => typeof path === "string");
      if (paths.length) await del(paths, { access: "private" });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405 });
  } catch (error) {
    return sendApiError(error);
  }
}
