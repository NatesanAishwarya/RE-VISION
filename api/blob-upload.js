import { handleUpload } from "@vercel/blob/client";
import { readExperiment, sendApiError, verifyFirebaseRequest } from "../server/firebase-admin.mjs";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  try {
    const body = await request.json();
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await verifyFirebaseRequest(request);
        const match = pathname.match(/^experiments\/([^/]+)\/([^/]+)\/(image|data\.json)$/);
        if (!match || match[1] !== user.uid || !ID_RE.test(match[2])) {
          throw Object.assign(new Error("Invalid experiment file path."), { status: 403 });
        }
        const experiment = await readExperiment(match[2]);
        const item = experiment.data();
        if (!experiment.exists || item?.ownerId !== user.uid || ![item.imagePath, item.dataPath].includes(pathname)) {
          throw Object.assign(new Error("Experiment not found, or it is not yours."), { status: 404 });
        }
        const isImage = match[3] === "image";
        return {
          allowedContentTypes: isImage ? ["image/png", "image/jpeg", "image/webp", "image/bmp"] : ["application/json"],
          maximumSizeInBytes: isImage ? 12 * 1024 * 1024 : 50 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return sendApiError(error);
  }
}
