// Fills documents.content_hash for Documents uploaded before the column existed.
// Usage: node --env-file=.env.local scripts/backfill-content-hash.mjs
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await db.from("documents").select("id, storage_path").is("content_hash", null);
if (error) throw error;

let filled = 0;
for (const row of data) {
  const file = await db.storage.from("documents").download(row.storage_path);
  if (file.error) {
    console.warn(`skip ${row.id}: ${file.error.message}`);
    continue;
  }
  const hash = createHash("sha256").update(Buffer.from(await file.data.arrayBuffer())).digest("hex");
  const { error: updateError } = await db.from("documents").update({ content_hash: hash }).eq("id", row.id);
  if (updateError) throw updateError;
  filled++;
}
console.log(`filled ${filled} of ${data.length}`);
