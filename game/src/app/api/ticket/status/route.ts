import { settle, TicketError, type TicketState } from "@/lib/ticket";

/**
 * What this wallet has: a ticket, a game wallet, and what is in it.
 *
 * The home screen calls this on connect, and it is also where a half-finished
 * purchase gets finished. `settle` reconciles against the chain rather than
 * against any record we kept — a player who holds the NFT but whose game wallet
 * was never funded is funded here, on the spot. See `ticket.ts`.
 *
 * The address comes in as a query parameter and is used only to *read* and to
 * derive. Nothing here is authenticated, and nothing needs to be: an attacker
 * passing someone else's address learns their ticket status and their game
 * wallet's balance — both of which are already public on chain — and can trigger
 * a payout that only ever goes to the rightful owner's derived address. There is
 * nothing to steal by asking.
 */

export type TicketStatusResponse = TicketState;

/** Reads the chain and can spend money. Never cache it. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const owner = new URL(request.url).searchParams.get("owner");

  if (!owner) {
    return Response.json({ error: "Missing owner address." }, { status: 400 });
  }

  try {
    return Response.json(await settle(owner));
  } catch (error) {
    if (error instanceof TicketError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("ticket/status", error);
    return Response.json(
      { error: "Could not read ticket status." },
      { status: 500 },
    );
  }
}
