import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "../../../src/server-auth";
import { db } from "../../../src/db";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const token = (request.headers.get("authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    const user = await authenticatedUser(token);
    const body = await request.json(),
      kind = String(body.kind),
      subject = String(body.subject || "").trim(),
      details = String(body.details || "").trim();
    if (
      ![
        "profile_change",
        "account_recovery",
        "data_export",
        "account_deletion",
        "suspension_appeal",
        "privacy",
        "other",
      ].includes(kind) ||
      !subject ||
      !details ||
      subject.length > 120 ||
      details.length > 4000
    )
      return NextResponse.json(
        { error: "Provide a valid request." },
        { status: 400 },
      );
    const rows =
      await db()`insert into public.account_requests(user_id,kind,subject,details) values(${user.id},${kind},${subject},${details}) returning id`;
    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
