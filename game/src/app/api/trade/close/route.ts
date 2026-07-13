import { closePosition, TradeError } from "@/lib/jupiter";
import { claim } from "@/lib/positions";

/**
 * Final whistle: liquidate the position the run opened with.
 *
 * The ticket names it. Whatever the token did while the ball was in play is what
 * comes back — usually about five cents, sometimes a little more, sometimes a
 * little less, and that difference is the only thing the game was ever really
 * betting on.
 */

export type CloseTradeResponse = {
  /** Dollars back — the whole pile, not just this run's stake. */
  usdOut: number;
  /** usdOut - usdIn, against *this run's* stake. The badge colours off the sign. */
  pnl: number;
  signature: string;
  /** Dead positions this goal rescued, one per past death. Zero on a clean run. */
  rescued: number;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { ticket } = (await request.json()) as { ticket?: string };
    if (!ticket) {
      return Response.json({ error: "No ticket." }, { status: 400 });
    }

    // Gone means gone: an unknown ticket is an expired run, a restarted server,
    // or a second close for a position already sold. None of them should send a
    // swap — that would sell tokens this run does not own.
    const position = claim(ticket);
    if (!position) {
      return Response.json(
        { error: "That position is no longer open." },
        { status: 409 },
      );
    }

    const closed = await closePosition(position);

    const body: CloseTradeResponse = {
      usdOut: closed.usdOut,
      pnl: closed.pnl,
      signature: closed.signature,
      rescued: closed.rescued,
    };
    return Response.json(body);
  } catch (error) {
    if (error instanceof TradeError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("trade/close", error);
    return Response.json({ error: "Could not close the position." }, { status: 500 });
  }
}
