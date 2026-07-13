import { buildPurchase, TicketError, type TicketPurchase } from "@/lib/ticket";

/**
 * Build the purchase and hand it to the browser to sign.
 *
 * The response is a transaction, not a receipt: it pays the treasury and mints
 * the ticket in one message, already signed by the treasury and by the asset,
 * and short exactly one signature — the player's. Their wallet adds it and sends
 * it. Nothing is spent until they do.
 *
 * Which means this route cannot take anyone's money. The worst an unauthenticated
 * caller can do is ask for a transaction that charges *themselves*, and then not
 * sign it. That is why there is no auth here: the signature is the authorisation,
 * and it happens in their wallet rather than on our server.
 *
 * The 0.05 SOL does not move here. It moves in `/api/ticket/status`, once the
 * mint is on chain and can be seen there — see `settle` in `ticket.ts`.
 */

export type MintTicketResponse = TicketPurchase;

/** Builds a transaction against a live blockhash. Caching it would hand out a
    message that expires. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let owner: string;

  try {
    const body = (await request.json()) as { owner?: string };
    if (!body.owner) throw new Error();
    owner = body.owner;
  } catch {
    return Response.json({ error: "Missing owner address." }, { status: 400 });
  }

  try {
    const purchase = await buildPurchase(owner);
    return Response.json(purchase satisfies MintTicketResponse);
  } catch (error) {
    // "You already own one" arrives here, and it is a TicketError — the player
    // reloaded a page that had already gone through. It reads as a message, not
    // as a crash.
    if (error instanceof TicketError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("ticket/mint", error);
    return Response.json(
      { error: "Could not build the ticket purchase." },
      { status: 500 },
    );
  }
}
