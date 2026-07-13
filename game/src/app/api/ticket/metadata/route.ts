import { TICKET_FUNDING_SOL } from "@/lib/ticket";

/**
 * The ticket's metadata, as every wallet and marketplace expects to find it.
 *
 * The URI baked into the asset on chain points here, and that URI can never be
 * changed — so this route is a permanent commitment. It must keep answering, and
 * it must keep answering the same thing. Do not move it, and do not rename it.
 *
 * The image is the same goal and the same idling footballer the player already
 * knows from the home screen, rendered out to an animated GIF by
 * `scripts/render-ticket.mjs`. The art is not generated here: it is a file, it
 * is committed, and it does not change between deploys — which is the least an
 * NFT can ask for.
 *
 * Every URL in here is absolute. A wallet fetching this JSON has no page to
 * resolve a relative path against — it is not a browser on our origin, it is a
 * server somewhere else with a bare URI — so `/nft/ticket.gif` would simply
 * fail to load, and the ticket would show up blank in every wallet that holds
 * one. Hence the hard requirement on `NEXT_PUBLIC_APP_ORIGIN`, which is the
 * same origin `ticket.ts` mints the URI against.
 */

function origin(): string {
  const value = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (!value) throw new Error("NEXT_PUBLIC_APP_ORIGIN is not set.");
  return value.replace(/\/$/, "");
}

export function GET(): Response {
  const base = origin();

  return Response.json({
    name: "Deathball World Cup Ticket",
    symbol: "DBWC",
    description:
      "Your seat at the Deathball World Cup. Holding this ticket funds your game wallet " +
      `with ${TICKET_FUNDING_SOL} SOL and lets you play. Every goal... is a scream.`,
    image: `${base}/nft/ticket.gif`,
    animation_url: `${base}/nft/ticket.gif`,
    external_url: base,
    attributes: [
      { trait_type: "Kit", value: "San Lorenzo" },
      { trait_type: "Competition", value: "World Cup" },
      { trait_type: "Grants", value: `${TICKET_FUNDING_SOL} SOL` },
    ],
    properties: {
      category: "image",
      files: [{ uri: `${base}/nft/ticket.gif`, type: "image/gif" }],
    },
  });
}
