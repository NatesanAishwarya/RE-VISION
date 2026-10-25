import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, openDb } from "./app.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(process.env.DB_FILE ?? path.join(here, "data", "revision.db"));
const app = createApp(db, { distDir: path.join(here, "..", "dist") });
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`RE:VISION server on http://localhost:${port}  (database: ${process.env.DB_FILE ?? "server/data/revision.db"})`));
