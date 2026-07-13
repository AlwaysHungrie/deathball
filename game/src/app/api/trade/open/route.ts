import { openPosition, TradeError } from "@/lib/jupiter";
import { remember } from "@/lib/positions";
import { STAKE_USD } from "@/lib/stake";

/**
 * Kickoff: buy $0.05 of the token with the game's own SOL.
 *
 * The browser gets back what it needs to draw the badge and to close the
 * position later — never the keypair, never the raw fill. The ticket is opaque
 * and single-use; see `positions.ts`.
 */

export type OpenTradeResponse = {
  /** Present it at `/api/trade/close` to sell this exact position. */
  ticket: string;
  /** Dollars spent. The badge counts down to this. ~STAKE_USD, not exactly. */
  usdIn: number;
  signature: string;
};

/** A trade is a side effect. Caching one would be a bug with a receipt. */
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const position = await openPosition();

    const body: OpenTradeResponse = {
      ticket: remember(position),
      usdIn: position.usdIn,
      signature: position.signature,
    };
    return Response.json(body);
  } catch (error) {
    // A TradeError is a trade that did not happen for a reason worth reading —
    // no funds, no route, no API key. Anything else is a bug, and says so.
    if (error instanceof TradeError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("trade/open", error);
    return Response.json(
      { error: `Could not open a $${STAKE_USD.toFixed(2)} position.` },
      { status: 500 },
    );
  }
}
