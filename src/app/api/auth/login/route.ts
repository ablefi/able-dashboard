import { NextResponse } from "next/server";

/** Password and backend-admin authentication are permanently disabled. */
export async function POST() {
  return NextResponse.json({ error: "Sign in with your Able Google account." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
