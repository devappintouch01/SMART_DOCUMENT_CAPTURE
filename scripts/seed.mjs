// Upserts the three seeded Document Types and their Fields.
// Usage: npm run db:seed   (reads POSTGRES_URL_NON_POOLING from .env.local)
// Safe to run repeatedly: ids are stable, so stored values stay attached.
import postgres from "postgres";
import { SEED_DOCUMENT_TYPES } from "../src/domain/seeds.ts";

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error("POSTGRES_URL_NON_POOLING is not set");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });

try {
  await sql.begin(async (tx) => {
    for (const type of SEED_DOCUMENT_TYPES) {
      await tx`
        insert into document_types (id, name, is_seed)
        values (${type.id}, ${type.name}, true)
        on conflict (id) do update set name = excluded.name, is_seed = true
      `;
      for (const field of type.fields) {
        await tx`
          insert into fields (id, document_type_id, scope, name, kind, description, position)
          values (${field.id}, ${type.id}, ${field.scope}, ${field.name}, ${field.kind}, ${field.description}, ${field.position})
          on conflict (id) do update set
            scope = excluded.scope, name = excluded.name, kind = excluded.kind,
            description = excluded.description, position = excluded.position
        `;
      }
      const keep = type.fields.map((f) => f.id);
      await tx`delete from fields where document_type_id = ${type.id} and id <> all(${keep})`;
    }
  });
  console.log(`seeded ${SEED_DOCUMENT_TYPES.length} Document Types`);
} finally {
  await sql.end();
}
