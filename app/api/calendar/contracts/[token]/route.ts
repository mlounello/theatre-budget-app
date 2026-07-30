import { NextResponse } from "next/server";
import {
  getContractCalendarFeed,
  isValidContractCalendarFeedToken
} from "@/lib/contract-calendar";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!isValidContractCalendarFeedToken(token)) {
    return new NextResponse("Calendar feed not found.", { status: 404 });
  }

  try {
    const calendar = await getContractCalendarFeed();
    return new NextResponse(calendar, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="theatre-budget-contracts.ics"',
        "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("[contract-calendar] Could not render feed", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return new NextResponse("Calendar feed is temporarily unavailable.", { status: 503 });
  }
}

