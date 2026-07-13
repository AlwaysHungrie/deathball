/**
 * The stake, in dollars. The whole mechanic in one number.
 *
 * It lives alone in a module of its own because both sides need it and only one
 * side may have the rest: `jupiter.ts` is `server-only` — importing it from the
 * badge would drag the keypair-reading code into the browser bundle, and the
 * build would rightly refuse. A constant has no such problem, so the constant
 * moves and the secrets stay put.
 */
export const STAKE_USD = 0.05;
