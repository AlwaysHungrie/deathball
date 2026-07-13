import type { NextRequest } from "next/server";

import { fetchOddsTimeline, type OddsPoint } from "@/lib/txline";

/**
 * How the market read one match, as a line.
 *
 * Called when a replay is picked off the carousel: the run cannot start until
 * the odds are in, because the odds are what the run is played against. The
 * spinner on the card is this request.
 *
 * Server-side because the credentials are. The browser gets percentages; the
 * API token never leaves this process.
 */

export type OddsResponse = {
  /** The 1X2, in time order. Chances in percent, summing to 100. */
  points: OddsPoint[];
};

/**
 * A finished match's odds never change again -- the whistle went, the market is
 * closed, and the history is history. It is a fan-out of ~48 upstream requests,
 * so serving the second caller from cache is the difference between a reel that
 * feels instant on a second pick and one that does the work twice.
 */
export const revalidate = 3600;

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;

  const fixtureId = Number(params.get("fixtureId"));
  const startTime = Number(params.get("startTime"));
  // Absent is not the same as false: a missing flag would silently swap the two
  // teams' chances, so it is required rather than defaulted.
  const homeFlag = params.get("participant1IsHome");

  if (!Number.isFinite(fixtureId) || !Number.isFinite(startTime) || !homeFlag) {
    return Response.json(
      { error: "fixtureId, startTime and participant1IsHome are required" },
      { status: 400 },
    );
  }

  try {
    const points = await fetchOddsTimeline(
      fixtureId,
      startTime,
      homeFlag === "true",
    );

    const body: OddsResponse = { points };
    return Response.json(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 502 },
    );
  }
}
