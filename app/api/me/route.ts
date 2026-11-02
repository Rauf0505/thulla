import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "../../../src/server-auth";
import { db } from "../../../src/db";
export const runtime = "nodejs";
async function current(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  return authenticatedUser(auth.replace(/^Bearer\s+/i, ""));
}
export async function GET(request: NextRequest) {
  try {
    const user = await current(request);
    const sql = db();
    const [profile, stats, matches, requests, role] = await Promise.all([
      sql`select id,display_name,avatar_url,status,created_at from public.profiles where id=${user.id}`,
      sql`select matches,wins,losses,bot_matches,last_played_at from public.player_stats where user_id=${user.id}`,
      sql`select m.id,m.ended_at,mp.result,m.status from public.match_players mp join public.matches m on m.id=mp.match_id where mp.user_id=${user.id} order by m.started_at desc limit 20`,
      sql`select id,kind,subject,status,admin_response,created_at,updated_at from public.account_requests where user_id=${user.id} order by created_at desc`,
      sql`select role from public.user_roles where user_id=${user.id}`,
    ]);
    return NextResponse.json({
      user,
      profile: profile[0],
      stats: stats[0],
      matches,
      requests,
      role: role[0]?.role || "player",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await current(request);
    const body = await request.json();
    const displayName = String(body.displayName || "").trim();
    if (displayName.length < 1 || displayName.length > 24)
      return NextResponse.json(
        { error: "Display name must be 1–24 characters." },
        { status: 400 },
      );
    await db()`update public.profiles set display_name=${displayName},updated_at=now() where id=${user.id} and status='active'`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
