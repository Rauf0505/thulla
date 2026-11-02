import postgres from "postgres";

export type DbRoom = {
  code: string;
  host_user_id: string;
  version: number;
  dealer: number;
  snapshot: unknown;
  state: string;
};
let client: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL)
    throw Error(
      "DATABASE_URL is required. Configure your Supabase PostgreSQL connection string.",
    );
  return (client ??= postgres(process.env.DATABASE_URL, {
    ssl: "require",
    max: 10,
    prepare: false,
  }));
}
export async function migrateRooms(): Promise<DbRoom[]> {
  const rows =
    await db()`select code,host_user_id,version,dealer,snapshot,state from public.rooms where state in ('waiting','playing')`;
  return rows as unknown as DbRoom[];
}
export async function bootstrapAdmins() {
  const emails = (process.env.ADMIN_BOOTSTRAP_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return;
  await db()`update public.user_roles roles set role='admin' from auth.users users where roles.user_id=users.id and lower(users.email)=any(${emails})`;
}
