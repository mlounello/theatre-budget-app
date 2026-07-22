import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access";

export async function GET() {
  try {
    const access = await getAccessContext();
    if (!access.userId) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (access.role === "none") {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
