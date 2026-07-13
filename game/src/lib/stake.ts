/**
 * The stake, in SOL. The whole mechanic in one number.
 *
 * SOL rather than dollars, because the trade now happens on devnet against a
 * random pump.fun bonding curve, and there is no such thing as the dollar value
 * of a devnet memecoin. The previous version staked $0.05 and could say so
 * because Jupiter priced the token on mainnet; nothing prices these, so the game
 * denominates in the only unit it can honestly name — the SOL that actually
 * leaves the player's game wallet.
 *
 * Small enough that the World Cup Ticket's 0.05 SOL funds several runs, large
 * enough that a bonding curve will fill it.
 *
 * It lives alone in a module of its own because both sides need it and only one
 * side may have the rest: `pump.ts` is `server-only` — importing it from the
 * badge would drag the key-deriving code into the browser bundle, and the build
 * would rightly refuse. A constant has no such problem, so the constant moves and
 * the secrets stay put.
 */
export const STAKE_SOL = 0.005;

/** Lamports in a SOL. Here rather than in `pump.ts` for the same reason as the
    stake: the badge converts what the server reports, and cannot import the
    server's module to do it. */
export const LAMPORTS_PER_SOL = 1_000_000_000;
