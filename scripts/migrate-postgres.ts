import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import postgres from "postgres";
for (const file of [".env.local", ".env"])
  try {
    loadEnvFile(file);
  } catch {}
const url = process.env.DATABASE_URL;
if (!url) throw Error("DATABASE_URL is required.");
const sql = postgres(url, { ssl: "require", max: 1, prepare: false });
const dir = join(process.cwd(), "supabase", "migrations");
await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
for (const name of (await readdir(dir))
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  const applied =
    await sql`select 1 from public.schema_migrations where name=${name}`;
  if (applied.length) continue;
  const migration = await readFile(join(dir, name), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
    await tx`insert into public.schema_migrations(name) values(${name})`;
  });
  console.log(`Applied ${name}`);
}
await sql.end();
