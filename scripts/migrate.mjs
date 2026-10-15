// Applies supabase/migrations/*.sql in name order, once each.
// Usage: npm run db:migrate   (reads POSTGRES_URL_NON_POOLING from .env.local)
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("POSTGRES_URL_NON_POOLING is not set");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  const applied = new Set(
    (await sql`select name from schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(new URL(file, dir), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}
