/**
 * Where the ticket's metadata and artwork actually live.
 *
 * Its own module, and deliberately not `server-only` — unlike `ticket.ts`, which
 * imports it. That file handles the treasury's key and so can never be pulled
 * into a client bundle; these two strings are public URLs that both sides need,
 * and a constant is not a secret. Left in `ticket.ts`, the buy dialog could not
 * have read them without dragging the treasury in behind them.
 *
 * Both point at object storage rather than at this app.
 *
 * That matters most for the metadata. Its URI is written into every asset on
 * chain and can never be changed — not by a later deploy, not by anyone — so a
 * URI resolving to a route we serve would be a promise that this app runs
 * forever, on this domain, answering that exact path, or every ticket ever sold
 * goes blank. An NFT whose art dies with a server is not much of an NFT. As a
 * file in a bucket, the app can go down, be rewritten, or move host, and every
 * ticket still resolves.
 *
 * They are constants and not environment variables for the same reason. This is
 * not configuration — it is a fact about the tickets that exist. A misconfigured
 * environment could otherwise mint assets pointing somewhere else entirely, and
 * there is no fixing those afterwards.
 *
 * To change the art, upload a new file and leave these alone: the URI on chain is
 * the one thing that cannot follow you.
 */

const BUCKET = "https://pub-930f236ba3094c8eb6dca76131bcab84.r2.dev";

/** The JSON every wallet and marketplace reads. Baked into the asset at mint. */
export const TICKET_METADATA_URI = `${BUCKET}/metadata.json`;

/** The artwork the metadata points at, and the same file the buy dialog shows —
    so that what a player is shown before buying is what they get. */
export const TICKET_IMAGE_URI = `${BUCKET}/ticket.gif`;
