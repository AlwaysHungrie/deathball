/**
 * Subscribes the game's own wallet to TxLINE and stores the credentials.
 *
 * phutball drives this handshake from the browser: the user's wallet extension
 * signs the subscribe transaction, then signs an activation string, and the
 * server keeps the API token that comes back. The game has no user and no
 * extension — it owns a keypair outright, so it can play both halves itself.
 * The sequence is otherwise identical, and deliberately so: if TxLINE changes
 * the preimage or the account order, both apps break the same way.
 *
 *   1. subscribe on-chain   — registers the wallet against a service level.
 *   2. guest JWT            — anonymous token, and part of the next signature.
 *   3. sign activation      — proves the subscribing wallet is asking.
 *   4. activate             — trades the signature for a long-lived API token.
 *
 * Step 1 costs SOL for fees and rent even on the free tier, where the TxL
 * transfer resolves to zero. Run with --generate to mint a fresh keypair, or
 * with no flags to subscribe the one already in .env.local.
 *
 *   node scripts/txline-subscribe.mjs
 *   node scripts/txline-subscribe.mjs --generate
 *   node scripts/txline-subscribe.mjs --service-level 1
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSignableMessage,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(ROOT, ".env.local");

/**
 * Mirrors phutball's src/lib/txline/config.ts. Duplicated rather than imported
 * because that lives in a different app; if TxLINE moves a program ID, both
 * copies need the edit.
 */
const NETWORKS = {
  devnet: {
    apiOrigin: "https://txline-dev.txodds.com",
    rpcUrl: "https://api.devnet.solana.com",
    programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlTokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
    defaultServiceLevel: 1,
  },
  mainnet: {
    apiOrigin: "https://txline.txodds.com",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    txlTokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
    // 1 = World Cup + Int Friendlies, 60s delay. 12 = the same, real time.
    defaultServiceLevel: 1,
  },
};

/** Subscriptions are sold in 4-week blocks. */
const SUBSCRIPTION_WEEKS = 4;

/**
 * An empty league list selects the standard bundle the free tier grants. It
 * also shapes the activation preimage, which collapses to `${txSig}::${jwt}`.
 */
const STANDARD_BUNDLE_LEAGUES = [];

const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([
  254, 28, 191, 138, 156, 179, 183, 53,
]);
const TOKEN_2022_PROGRAM = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

const addressEncoder = getAddressEncoder();

// --- env file -----------------------------------------------------------------

/** Minimal .env reader: enough for KEY=value, which is all this file holds. */
function readEnv() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(ENV_PATH, "utf8");
  } catch {
    return env;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

/**
 * Rewrites keys in place, preserving comments and ordering, and appending any
 * key the file does not already carry.
 */
function updateEnv(updates) {
  let lines;
  try {
    lines = readFileSync(ENV_PATH, "utf8").split("\n");
  } catch {
    lines = [];
  }

  const pending = new Set(Object.keys(updates));

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;

    const key = trimmed.slice(0, eq);
    if (!pending.has(key)) return line;

    pending.delete(key);
    return `${key}=${updates[key]}`;
  });

  for (const key of pending) rewritten.push(`${key}=${updates[key]}`);

  writeFileSync(ENV_PATH, rewritten.join("\n"), { mode: 0o600 });
}

// --- wallet -------------------------------------------------------------------

/**
 * Kit's `generateKeyPairSigner` marks the private key non-extractable, so it
 * cannot be written to an env file. Generate through WebCrypto with
 * `extractable: true` and assemble the 64-byte secret key Solana tooling
 * expects: 32-byte seed followed by the 32-byte public key.
 */
async function generateWallet() {
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
  return { signer, secretKeyBase58: getBase58Decoder().decode(secretKey) };
}

async function loadWallet(secretKeyBase58) {
  const bytes = new Uint8Array(getBase58Encoder().encode(secretKeyBase58));
  if (bytes.length !== 64) {
    throw new Error(
      `TXLINE_WALLET_SECRET_KEY decodes to ${bytes.length} bytes, expected 64.`,
    );
  }
  return createKeyPairSignerFromBytes(bytes);
}

// --- instructions -------------------------------------------------------------

async function findAssociatedTokenAddress(owner, mint) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [
      addressEncoder.encode(owner),
      addressEncoder.encode(TOKEN_2022_PROGRAM),
      addressEncoder.encode(mint),
    ],
  });
  return pda;
}

async function deriveSubscriptionAccounts(user, config) {
  const programAddress = address(config.programId);
  const tokenMint = address(config.txlTokenMint);

  const [pricingMatrix] = await getProgramDerivedAddress({
    programAddress,
    seeds: [new TextEncoder().encode("pricing_matrix")],
  });
  const [tokenTreasuryPda] = await getProgramDerivedAddress({
    programAddress,
    seeds: [new TextEncoder().encode("token_treasury_v2")],
  });

  const [userTokenAccount, tokenTreasuryVault] = await Promise.all([
    findAssociatedTokenAddress(user, tokenMint),
    findAssociatedTokenAddress(tokenTreasuryPda, tokenMint),
  ]);

  return {
    programAddress,
    tokenMint,
    pricingMatrix,
    tokenTreasuryPda,
    tokenTreasuryVault,
    userTokenAccount,
  };
}

/**
 * `subscribe` reads the caller's TxL token account but will not create it, so a
 * wallet that has never held TxL fails with AccountNotInitialized before the
 * program can charge it nothing. CreateIdempotent is a no-op when the account
 * exists, so prepending it is safe on renewals too.
 */
async function buildSubscribeInstructions(user, config, serviceLevelId) {
  const accounts = await deriveSubscriptionAccounts(user, config);

  const createTokenAccount = {
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    accounts: [
      { address: user, role: 3 }, // payer: writable signer
      { address: accounts.userTokenAccount, role: 1 }, // writable
      { address: user, role: 0 },
      { address: accounts.tokenMint, role: 0 },
      { address: SYSTEM_PROGRAM, role: 0 },
      { address: TOKEN_2022_PROGRAM, role: 0 },
    ],
    data: new Uint8Array([1]), // 1 = CreateIdempotent
  };

  const data = new Uint8Array(11);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  const view = new DataView(data.buffer);
  view.setUint16(8, serviceLevelId, true); // u16 little-endian
  view.setUint8(10, SUBSCRIPTION_WEEKS);

  const subscribe = {
    programAddress: accounts.programAddress,
    accounts: [
      { address: user, role: 3 }, // writable signer
      { address: accounts.pricingMatrix, role: 0 },
      { address: accounts.tokenMint, role: 0 },
      { address: accounts.userTokenAccount, role: 1 },
      { address: accounts.tokenTreasuryVault, role: 1 },
      { address: accounts.tokenTreasuryPda, role: 0 },
      { address: TOKEN_2022_PROGRAM, role: 0 },
      { address: SYSTEM_PROGRAM, role: 0 },
      { address: ASSOCIATED_TOKEN_PROGRAM, role: 0 },
    ],
    data,
  };

  return [createTokenAccount, subscribe];
}

/** Polls until the transaction confirms or its blockhash expires. */
async function confirmTransaction(rpc, signature, lastValidBlockHeight) {
  for (;;) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];

    if (status?.err) {
      throw new Error(
        `Subscribe transaction failed on-chain: ${JSON.stringify(status.err)}`,
      );
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    if ((await rpc.getBlockHeight().send()) > lastValidBlockHeight) {
      throw new Error("Transaction expired before confirming. Re-run.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// --- TxLINE API ---------------------------------------------------------------

async function startGuestSession(config) {
  const response = await fetch(`${config.apiOrigin}/auth/guest/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Guest auth failed (${response.status}): ${await response.text()}`,
    );
  }
  const { token } = await response.json();
  return token;
}

/**
 * Activation answers with the bare token string ("txoracle_api_…") rather than
 * a JSON object, so read it as text and only parse if it happens to be JSON.
 */
async function activateApiToken(config, { txSig, walletSignature, jwt }) {
  const response = await fetch(`${config.apiOrigin}/api/token/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      txSig,
      walletSignature,
      leagues: STANDARD_BUNDLE_LEAGUES,
    }),
  });

  if (!response.ok) {
    // A 403 here is nearly always the signature preimage, the signing wallet,
    // or a devnet transaction offered to the mainnet host.
    throw new Error(
      `Activation failed (${response.status}): ${await response.text()}`,
    );
  }

  const body = (await response.text()).trim();
  let apiToken;
  try {
    const parsed = JSON.parse(body);
    apiToken = typeof parsed === "string" ? parsed : parsed.token;
  } catch {
    apiToken = body || undefined;
  }
  if (!apiToken) throw new Error("Activation response contained no API token.");
  return apiToken;
}

/** Reads the `exp` claim without verifying: we are the audience, not the issuer. */
function jwtExpiry(jwt) {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString(),
    );
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// --- main ---------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const env = readEnv();

  const networkName = env.TXLINE_NETWORK ?? "devnet";
  const config = NETWORKS[networkName];
  if (!config) {
    throw new Error(
      `Unknown TXLINE_NETWORK "${networkName}". Expected devnet or mainnet.`,
    );
  }

  const levelFlag = args.indexOf("--service-level");
  const serviceLevelId =
    levelFlag === -1 ? config.defaultServiceLevel : Number(args[levelFlag + 1]);

  // --generate mints a wallet and stops, so it can be funded before it spends.
  if (args.includes("--generate")) {
    const { signer, secretKeyBase58 } = await generateWallet();
    updateEnv({
      TXLINE_WALLET_ADDRESS: signer.address,
      TXLINE_WALLET_SECRET_KEY: secretKeyBase58,
    });
    console.log(`Wallet generated and written to .env.local`);
    console.log(`  address: ${signer.address}`);
    console.log(`\nFund it, then re-run without --generate:`);
    console.log(`  solana airdrop 2 ${signer.address} --url devnet`);
    return;
  }

  if (!env.TXLINE_WALLET_SECRET_KEY) {
    throw new Error(
      "No TXLINE_WALLET_SECRET_KEY in .env.local. Run with --generate first.",
    );
  }

  const signer = await loadWallet(env.TXLINE_WALLET_SECRET_KEY);
  const rpc = createSolanaRpc(config.rpcUrl);

  console.log(`network:        ${networkName}`);
  console.log(`wallet:         ${signer.address}`);
  console.log(`service level:  ${serviceLevelId}`);

  // Fail early and legibly rather than deep inside a simulate error.
  const { value: balance } = await rpc.getBalance(signer.address).send();
  console.log(`balance:        ${Number(balance) / 1e9} SOL`);
  if (balance === 0n) {
    throw new Error(
      `Wallet has no SOL. Subscribe needs fees + rent even on the free tier:\n` +
        `  solana airdrop 2 ${signer.address} --url ${networkName}`,
    );
  }

  // 1. subscribe on-chain.
  console.log(`\n[1/4] Building and sending subscribe…`);
  const instructions = await buildSubscribeInstructions(
    signer.address,
    config,
    serviceLevelId,
  );
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  // phutball hands the message to a wallet-ui signer, which signs *and* sends.
  // A keypair signer only signs, so sign and broadcast are two steps here.
  const signedTransaction = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayerSigner(signer, message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(blockhash, message),
      (message) => appendTransactionMessageInstructions(instructions, message),
    ),
  );

  const txSig = getSignatureFromTransaction(signedTransaction);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signedTransaction), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();
  console.log(`      tx: ${txSig}`);

  console.log(`      confirming…`);
  await confirmTransaction(rpc, txSig, blockhash.lastValidBlockHeight);
  console.log(`      confirmed.`);

  // 2. guest JWT — needed before activation, and part of what gets signed.
  console.log(`[2/4] Requesting guest JWT…`);
  const jwt = await startGuestSession(config);

  // 3. sign the activation preimage. Byte-exact: an empty league list means two
  //    adjacent colons, and drift here reads as a 403 rather than a clear error.
  console.log(`[3/4] Signing activation message…`);
  const preimage = `${txSig}:${STANDARD_BUNDLE_LEAGUES.join(",")}:${jwt}`;
  const [signatureMap] = await signer.signMessages([
    createSignableMessage(preimage),
  ]);
  const walletSignature = Buffer.from(signatureMap[signer.address]).toString(
    "base64",
  );

  // 4. trade the signature for the API token.
  console.log(`[4/4] Activating API token…`);
  const apiToken = await activateApiToken(config, {
    txSig,
    walletSignature,
    jwt,
  });

  updateEnv({
    TXLINE_API_TOKEN: apiToken,
    TXLINE_JWT: jwt,
  });

  console.log(`\nActivated. Credentials written to .env.local.`);
  console.log(`  API token: ${apiToken.slice(0, 16)}… (${apiToken.length} chars)`);
  console.log(`  JWT expires: ${new Date(jwtExpiry(jwt)).toISOString()}`);
  console.log(
    `\nThe API token is long-lived. The JWT is not — renew it against\n` +
      `${config.apiOrigin}/auth/guest/start when it lapses; no re-signing needed.`,
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
