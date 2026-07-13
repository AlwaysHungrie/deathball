import { remember } from "@/lib/positions";
import { openPosition, TradeError } from "@/lib/pump";
import { STAKE_SOL } from "@/lib/stake";

/**
 * Kickoff: buy a random pump.fun token, out of the player's own game wallet.
 *
 * Two things changed here when the trade moved to devnet, and both are visible in
 * the signature of this route:
 *
 *   - It takes an **address** now. The wallet that pays is derived from it, so a
 *     request without one has nobody to spend for. It used to spend the house's.
 *   - It answers in **lamports**, not dollars. Devnet tokens have no price, and a
 *     USD figure for one would be invented rather than quoted.
 *
 * The browser gets back what it needs to draw the badge and to close the position
 * later — never the keypair, never the derived key. The ticket is opaque and
 * single-use; see `positions.ts`.
 */

export type OpenTradeResponse = {
  /** Present it at `/api/trade/close` to sell this exact position. */
  ticket: string;
  /** Lamports spent, fees and rent included — a string, because JSON has no bigint. */
  lamports: string;
  /** What was bought. The player finds out what they are holding here. */
  mint: string;
  signature: string;
};

/** A trade is a side effect. Caching one would be a bug with a receipt. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { owner } = (await request.json()) as { owner?: string };

    // No address, no wallet to derive, no trade. This is the connected wallet —
    // identity, and now also the root of the key that pays.
    if (!owner) {
      return Response.json({ error: "No wallet connected." }, { status: 400 });
    }

    const position = await openPosition(owner);

    const body: OpenTradeResponse = {
      ticket: remember(position),
      lamports: position.lamports,
      mint: position.mint,
      signature: position.signature,
    };
    return Response.json(body);
  } catch (error) {
    // A TradeError is a trade that did not happen for a reason worth reading — no
    // funds, no curve, a swap that did not land. Anything else is a bug, and says so.
    if (error instanceof TradeError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("trade/open", error);
    return Response.json(
      { error: `Could not open a ${STAKE_SOL} SOL position.` },
      { status: 500 },
    );
  }
}
