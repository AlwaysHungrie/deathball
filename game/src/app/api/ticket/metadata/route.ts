import { TICKET_METADATA_URI } from "@/lib/ticket-assets";

/**
 * The ticket's metadata — or rather, the way to it.
 *
 * This route used to *be* the metadata: it built the JSON, and the URI baked
 * into every asset pointed here. It does not any more. The metadata is a static
 * file in object storage now, and the mint points straight at that — see
 * `TICKET_METADATA_URI` — because an on-chain URI is permanent, and one that
 * resolves to a route in this app is a promise that this app runs forever, on
 * this domain, answering this exact path. Tickets outlive deployments.
 *
 * The route stays anyway, redirecting, because assets minted before the move
 * still carry the old URI and no later deploy can change what is written on
 * chain. Deleting it would blank them for good. It costs nothing to keep, and
 * keeping it is the only thing that can still help them.
 *
 * So: do not remove this, and do not rename it. Nothing new points here, and
 * that is the point — but something old does, and it cannot be told otherwise.
 */
export function GET(): Response {
  // 301, not 302: the move is permanent, because the file it moved to is where
  // the metadata now lives for good. Wallets and marketplaces cache aggressively,
  // and here that is welcome.
  return Response.redirect(TICKET_METADATA_URI, 301);
}
