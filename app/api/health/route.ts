import { NextResponse } from "next/server";
import { db } from "../../../src/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db()`select 1`;
    return NextResponse.json({ ok: true, database: "postgres" });
  } catch {
    return NextResponse.json(
      { ok: false, database: "unavailable" },
      { status: 503 },
    );
  }
}
