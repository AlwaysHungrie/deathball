import { claim } from "@/lib/positions";
import { closePosition, TradeError } from "@/lib/pump";

/**
 * Final whistle: sell the token the run opened with, back into the curve it came
 * from, out of the wallet that bought it.
 *
 * Whatever that token did while the ball was in play is what comes back — usually
 * about what went in, sometimes more, sometimes less, and that difference is the
 * only thing the game was ever really betting on.
 *
 * The wallet is re-derived from the position's own record of its owner, not from
 * anything the browser sends. A ticket names a position; it does not name a
 * wallet to raid.
 */

export type CloseTradeResponse = {
  /** Lamports back. A string — JSON has no bigint. */
  lamports: string;
  /** Against what the open leg cost. The badge colours off the sign. */
  pnl: string;
  signature: string;
  /** What was sold. The badge names it, since the player never chose it. */
  mint: string;
};

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { ticket } = (await request.json()) as { ticket?: string };
    if (!ticket) {
      return Response.json({ error: "No ticket." }, { status: 400 });
    }

    // Gone means gone: an unknown ticket is an expired run, a restarted server, or
    // a second close for a position already sold. None of them should send a swap —
    // that would sell tokens this run does not own.
    const position = claim(ticket);
    if (!position) {
      return Response.json(
        { error: "That position is no longer open." },
        { status: 409 },
      );
    }

    const closed = await closePosition(position);

    const body: CloseTradeResponse = {
      lamports: closed.lamports,
      pnl: closed.pnl,
      signature: closed.signature,
      mint: closed.mint,
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
