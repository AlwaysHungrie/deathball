import "server-only";

import type { Position } from "@/lib/pump";

/**
 * Open positions, from kickoff to the final whistle.
 *
 * The close leg has to sell exactly the tokens the open leg bought — not a
 * re-quote, not the wallet's balance — so what was bought has to outlive the
 * request that bought it. It is held here, keyed by a ticket the browser carries
 * back when the run ends.
 *
 * In memory, deliberately. A position lives for the couple of minutes a run
 * lasts, so a database would be storing something that is always about to be
 * deleted. The cost is honest and worth naming: a server restart mid-run strands
 * that run's tokens in the wallet, and a deployment with more than one instance
 * will drop the ticket on the floor if the close lands on a different one. Both
 * are fine for a game running on a single box. Neither is fine at scale — this
 * is the first thing to move to Redis when there is a second instance.
 */

const open = new Map<string, { position: Position; openedAt: number }>();

/** A run is a couple of minutes; ten is generous. Past that, the ticket is a
    leak rather than a position — the player closed the tab, and nothing is ever
    coming back for it. */
const TTL_MS = 10 * 60_000;

export function remember(position: Position): string {
  sweep();
  const ticket = crypto.randomUUID();
  open.set(ticket, { position, openedAt: Date.now() });
  return ticket;
}

/**
 * Claim a position, once. Deleting on read is what stops a replayed ticket from
 * selling a position twice — the second close finds nothing and says so, rather
 * than sending a swap for tokens the wallet no longer holds.
 */
export function claim(ticket: string): Position | null {
  sweep();
  const held = open.get(ticket);
  if (!held) return null;
  open.delete(ticket);
  return held.position;
}

function sweep(): void {
  const now = Date.now();
  for (const [ticket, { openedAt }] of open) {
    if (now - openedAt > TTL_MS) open.delete(ticket);
  }
}
