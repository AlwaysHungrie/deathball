import "server-only";

import { createHmac } from "node:crypto";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  type KeyPairSigner,
} from "@solana/kit";

/**
 * The player's game wallet — derived, never stored.
 *
 * Connecting a wallet gives every player a second one: an ed25519 keypair the
 * game owns on their behalf, which is what the world cup ticket funds and what
 * the game will eventually stake. It is derived from their public address and a
 * server-side secret, so there is no table of keys anywhere — the same address
 * always yields the same wallet, and the wallet exists the moment it is asked
 * for rather than the moment it is created.
 *
 * ## What this actually is
 *
 * A custodial wallet with the database left out. Be clear-eyed about the trade:
 *
 * - **The server can spend every player's game wallet.** It holds the secret, so
 *   it can re-derive any private key on demand. This is not a leak in the design;
 *   it *is* the design. The player does not control this wallet and never signs
 *   for it — they control the wallet they connected with, which is the one that
 *   buys the ticket.
 *
 * - **`KEY_DERIVATION_SECRET` is the master key to all of them.** If it leaks,
 *   every game wallet is drainable by whoever has it. Treat it like the root of
 *   a custody system, because that is what it is.
 *
 * - **Rotating the secret orphans every existing wallet.** New derivations will
 *   not match old ones, so the funds sitting in the old addresses become
 *   unreachable — nobody, including the server, can re-derive a key from a secret
 *   that no longer exists. There is no migration path that does not involve
 *   sweeping every old wallet *before* the rotation, using the old secret.
 *
 * At the amounts involved — 0.05 SOL a head — this is a reasonable place to
 * land. It is not a reasonable place to stay if the balances grow.
 */

/**
 * Domain separation. Mixed into every derivation so that this secret, used for
 * this purpose, cannot collide with the same secret used for another — if a
 * second kind of derived key is ever added, it gets its own tag and the two
 * cannot produce the same bytes from the same input.
 */
const DOMAIN = "deathball:game-wallet:v1";

/**
 * The secret behind every derived key. Read per call rather than at module load
 * so a missing value fails the request that needed it, not the whole server —
 * the same reasoning as `jupiter.ts`'s `config()`.
 */
function secret(): string {
  const value = process.env.KEY_DERIVATION_SECRET;
  if (!value) {
    throw new Error("KEY_DERIVATION_SECRET is not set.");
  }
  // A short secret is a guessable secret, and a guessable secret is every game
  // wallet at once. Refuse rather than derive from something weak.
  if (value.length < 32) {
    throw new Error(
      "KEY_DERIVATION_SECRET must be at least 32 characters — it is the master key to every game wallet.",
    );
  }
  return value;
}

/**
 * The game wallet for a connected address.
 *
 * HMAC-SHA512 gives 64 bytes; ed25519 wants a 32-byte seed, so the first half is
 * the seed and the second is discarded. SHA-512 rather than SHA-256 because
 * that is what the ed25519 seed expansion expects to be fed, and taking half of
 * a 512-bit tag is a cleaner story than stretching a 256-bit one.
 *
 * Deterministic in the address, so calling it twice returns the same wallet. It
 * is the only way back to the key — nothing writes it down.
 */
export async function gameWallet(ownerAddress: string): Promise<KeyPairSigner> {
  const tag = createHmac("sha512", secret())
    .update(`${DOMAIN}:${ownerAddress}`)
    .digest();

  const seed = new Uint8Array(tag.subarray(0, 32));

  // The 32-byte path, deliberately: `createKeyPairSignerFromBytes` wants 64 —
  // a private key *and* the public key that goes with it — and we have neither,
  // only entropy. This is the one that takes a private key on its own and
  // expands it to the pair, which is what a seed is.
  return createKeyPairSignerFromPrivateKeyBytes(seed);
}

/** Just the address — for the balance the home screen shows, which needs no key. */
export async function gameWalletAddress(ownerAddress: string): Promise<string> {
  const signer = await gameWallet(ownerAddress);
  return signer.address;
}
