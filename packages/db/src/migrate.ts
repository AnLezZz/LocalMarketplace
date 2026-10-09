import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dir = join(import.meta.dirname, "../migrations");
for (const f of readdirSync(dir).sort()) {
  console.log("applying", f);
  await pool.query(readFileSync(join(dir, f), "utf8"));
}
await pool.end();
