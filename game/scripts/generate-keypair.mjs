/**
 * Prints a fresh Solana keypair. Writes nothing.
 *
 * `txline-subscribe.mjs --generate` also makes a keypair, but it *writes it into
 * .env.local*, overwriting whatever wallet was there — which is a fine thing for
 * it to do to its own wallet and a terrible thing to do to anyone else's. This
 * one prints and exits, so it can be used to mint a key for any purpose without
 * putting an existing one at risk.
 *
 *     node scripts/generate-keypair.mjs
 *
 * Copy the secret key into whichever variable wants it — TREASURY_WALLET_SECRET_KEY,
 * TRADE_WALLET_SECRET_KEY — by hand. That is deliberate: an env file is worth
 * reading before it is written.
 */

import { createKeyPairSignerFromBytes, getBase58Decoder } from "@solana/kit";

// Kit's `generateKeyPairSigner` marks the private key non-extractable, so it
// cannot be printed. WebCrypto with `extractable: true` can, and the 64-byte
// secret key Solana tooling expects is the 32-byte seed followed by the 32-byte
// public key. (Same assembly as `txline-subscribe.mjs`.)
const keyPair = await crypto.subtle.generateKey("Ed25519", true, [
  "sign",
  "verify",
]);

const pkcs8 = new Uint8Array(
  await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
);
const publicKey = new Uint8Array(
  await crypto.subtle.exportKey("raw", keyPair.publicKey),
);
const secretKey = new Uint8Array([...pkcs8.slice(-32), ...publicKey]);

const signer = await createKeyPairSignerFromBytes(secretKey);

console.log(`address:    ${signer.address}`);
console.log(`secret key: ${getBase58Decoder().decode(secretKey)}`);
console.log("\nNothing was written. Paste the secret key where you want it.");
