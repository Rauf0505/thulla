import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "../../../src/server-auth";
import { db } from "../../../src/db";
export const runtime = "nodejs";
async function admin(request: NextRequest) {
  const user = await authenticatedUser(
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
  );
  const roles =
    await db()`select role from public.user_roles where user_id=${user.id}`;
  const role = String(roles[0]?.role);
  if (!["admin", "moderator"].includes(role))
    throw Error("Administrator access is required.");
  return { user, role };
}
export async function GET(request: NextRequest) {
  try {
    await admin(request);
    const sql = db();
    const [requests, audit, users] = await Promise.all([
      sql`select r.id,r.user_id,r.kind,r.subject,r.status,r.created_at,p.display_name from public.account_requests r join public.profiles p on p.id=r.user_id where r.status in ('open','in_review') order by r.created_at limit 100`,
      sql`select action,reason,created_at from public.admin_audit_log order by created_at desc limit 50`,
      sql`select p.id,p.display_name,p.status,s.matches,s.wins,s.losses from public.profiles p join public.player_stats s on s.user_id=p.id order by p.created_at desc limit 100`,
    ]);
    return NextResponse.json({ requests, audit, users });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const access = await admin(request),
      actor = access.user,
      body = await request.json(),
      target = String(body.userId || ""),
      reason = String(body.reason || "").trim(),
      action = String(body.action || "");
    if (
      access.role !== "admin" &&
      ["set_role", "anonymize_user", "correct_stats"].includes(action)
    )
      throw Error("Only an administrator can perform this action.");
    if (!target || reason.length < 3)
      return NextResponse.json(
        { error: "Target and a reason are required." },
        { status: 400 },
      );
    const sql = db();
    await sql.begin(async (tx) => {
      const before = (
        await tx`select p.status,s.matches,s.wins,s.losses from public.profiles p join public.player_stats s on s.user_id=p.id where p.id=${target}`
      )[0];
      if (!before) throw Error("User not found.");
      if (action === "set_status") {
        const status = String(body.status);
        if (!["active", "suspended", "pending_deletion"].includes(status))
          throw Error("Invalid status.");
        await tx`update public.profiles set status=${status},suspended_reason=${reason},updated_at=now() where id=${target}`;
      } else if (action === "correct_stats") {
        const wins = Number(body.winsDelta || 0),
          losses = Number(body.lossesDelta || 0);
        if (
          !Number.isInteger(wins) ||
          !Number.isInteger(losses) ||
          wins < 0 ||
          losses < 0 ||
          wins + losses < 1
        )
          throw Error(
            "Corrections must add a positive whole number of wins or losses.",
          );
        await tx`insert into public.player_stat_ledger(user_id,wins_delta,losses_delta,matches_delta,reason,actor_user_id) values(${target},${wins},${losses},${wins + losses},${reason},${actor.id})`;
        await tx`update public.player_stats set wins=wins+${wins},losses=losses+${losses},matches=matches+${wins + losses},updated_at=now() where user_id=${target}`;
      } else if (action === "set_profile") {
        const displayName = String(body.displayName || "").trim();
        if (displayName.length < 1 || displayName.length > 24)
          throw Error("Display name must be 1–24 characters.");
        await tx`update public.profiles set display_name=${displayName},updated_at=now() where id=${target}`;
      } else if (action === "set_role") {
        const role = String(body.role);
        if (!["player", "moderator", "admin"].includes(role))
          throw Error("Invalid role.");
        await tx`update public.user_roles set role=${role},granted_by=${actor.id},granted_at=now() where user_id=${target}`;
      } else if (action === "anonymize_user") {
        await tx`update public.profiles set display_name='Deleted player',avatar_url=null,status='deleted',updated_at=now() where id=${target}`;
        await tx`update public.user_roles set role='player' where user_id=${target}`;
      } else if (action === "resolve_request") {
        const requestId = String(body.requestId || ""),
          status = String(body.status),
          response = String(body.response || "");
        if (!requestId || !["resolved", "rejected"].includes(status))
          throw Error("A request and resolution are required.");
        await tx`update public.account_requests set status=${status},admin_response=${response},resolved_by=${actor.id},resolved_at=now(),updated_at=now() where id=${requestId}`;
      } else throw Error("Unknown admin action.");
      const after = (
        await tx`select p.status,s.matches,s.wins,s.losses from public.profiles p join public.player_stats s on s.user_id=p.id where p.id=${target}`
      )[0];
      await tx`insert into public.admin_audit_log(actor_user_id,target_user_id,action,reason,before_data,after_data) values(${actor.id},${target},${action},${reason},${tx.json(before)},${tx.json(after)})`;
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 400 },
    );
  }
}
