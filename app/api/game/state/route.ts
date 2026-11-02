import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "../../../../src/server-auth";
import { ensureBootstrapped } from "../../../../src/db";
import { getView, profileFor } from "../../../../src/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed.";

export async function GET(request: NextRequest) {
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
  try {
    await ensureBootstrapped();
    user.name = await profileFor(user.id);
    const result = await getView(
      user.id,
      request.nextUrl.searchParams.get("code") || undefined,
    );
    return NextResponse.json({ view: result.view });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}
