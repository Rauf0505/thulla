import { createClient } from "@supabase/supabase-js";
export type AuthUser = { id: string; email: string | null; name: string };
let client: ReturnType<typeof createClient> | undefined;
function supabase() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return (client ??= createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }));
}
export async function authenticatedUser(
  accessToken: string,
): Promise<AuthUser> {
  const { data, error } = await supabase().auth.getUser(accessToken);
  if (error || !data.user)
    throw Error("Your sign-in has expired. Please sign in again.");
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: String(
      data.user.user_metadata.full_name ||
        data.user.user_metadata.name ||
        "Player",
    ).slice(0, 24),
  };
}
