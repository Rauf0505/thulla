import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "../../../../src/server-auth";
import { ensureBootstrapped } from "../../../../src/db";
import { profileFor, runCommand } from "../../../../src/room";
import type { Command } from "../../../../src/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed.";

// Best-effort limiter. Serverless instances are ephemeral, but this still stops
// a single client from hammering one warm instance.
const buckets = new Map<string, { at: number; count: number }>();
function limited(userId: string) {
  const now = Date.now();
  const bucket = buckets.get(userId);
  if (!bucket || now - bucket.at > 1000) {
    buckets.set(userId, { at: now, count: 1 });
    if (buckets.size > 1000)
      for (const [key, value] of buckets)
        if (now - value.at > 60_000) buckets.delete(key);
    return false;
  }
  bucket.count++;
  return bucket.count > 20;
}

export async function POST(request: NextRequest) {
  let user;
  try {
    const token = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    user = await authenticatedUser(token);
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 401 });
  }
  if (limited(user.id))
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  try {
    await ensureBootstrapped();
    user.name = await profileFor(user.id);
    const body = (await request.json()) as Command;
    if (!body || typeof body !== "object" || typeof body.type !== "string")
      return NextResponse.json({ error: "Unknown command." }, { status: 400 });
    const result = await runCommand(user.id, user.name, body);
    if (result.error)
      return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ view: result.view, left: result.left });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}
