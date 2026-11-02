import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!process.env.DATABASE_URL)
    throw Error(
      "DATABASE_URL is required. Configure your Supabase PostgreSQL connection string.",
    );
  const max = Number(process.env.DB_MAX || (process.env.VERCEL ? 1 : 10));
  return (client ??= postgres(process.env.DATABASE_URL, {
    ssl: "require",
    max: Number.isFinite(max) && max > 0 ? max : 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  }));
}

export async function bootstrapAdmins() {
  const emails = (process.env.ADMIN_BOOTSTRAP_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return;
  await db()`update public.user_roles roles set role='admin' from auth.users users where roles.user_id=users.id and lower(users.email)=any(${emails})`;
}

let bootstrapped: Promise<void> | undefined;

/**
 * Serverless hosts have no startup hook, so admin bootstrap runs lazily once
 * per instance. It is idempotent and safe to call from every game route.
 */
export function ensureBootstrapped() {
  return (bootstrapped ??= bootstrapAdmins().catch((error) => {
    bootstrapped = undefined;
    console.error("Admin bootstrap failed", error);
  }));
}
