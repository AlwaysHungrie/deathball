import "server-only";

import {
  address,
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getUtf8Encoder,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base58EncodedBytes,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { gameWallet } from "@/lib/derive";

/**
 * The World Cup Ticket.
 *
 * An NFT the player buys with their own wallet, and the thing that turns a
 * connected address into a funded one. Buying it does two things at once:
 *
 *   1. mints them the ticket, and
 *   2. puts 0.05 SOL into the game wallet derived from their address.
 *
 * Those are two transactions, not one, and the seam between them is the whole
 * of the complexity in this file. The player signs the first — it pays the
 * treasury and mints the asset to them, both in the one signature, so there is a
 * single wallet popup. The server sends the second, out of the treasury and into
 * their derived wallet, once it has seen the first confirm.
 *
 * A server that dies in that seam leaves a player who paid and has nothing. So
 * the funding is never assumed to have happened: `settle` re-checks both halves
 * against the chain on every home-screen load and pays out whatever is owed. The
 * NFT is the receipt, and the receipt is on-chain — which is what makes the
 * whole thing recoverable without a database to remember it went wrong.
 */

/* -- the numbers ----------------------------------------------------------- */

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** What the player pays, all in. */
export const TICKET_PRICE_SOL = 0.06;
const TICKET_PRICE_LAMPORTS = BigInt(TICKET_PRICE_SOL * Number(LAMPORTS_PER_SOL));

/**
 * What lands in their game wallet. The rest of the price — about 0.007 SOL after
 * the asset's rent and the fees on both transactions — is the treasury's.
 */
export const TICKET_FUNDING_SOL = 0.05;
const TICKET_FUNDING_LAMPORTS = BigInt(
  TICKET_FUNDING_SOL * Number(LAMPORTS_PER_SOL),
);

/* -- Metaplex Core --------------------------------------------------------- */

const CORE_PROGRAM = address("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

const TICKET_NAME = "Deathball World Cup Ticket";

/* -- config ---------------------------------------------------------------- */

/**
 * Per call, not at module load: a missing key fails the request, not the server.
 *
 * Devnet, deliberately, and not the same cluster as `jupiter.ts` — the ticket is
 * bought with a browser wallet, and asking a player to sign a mainnet mint is
 * asking them to spend real SOL. The in-game trade stays on mainnet because
 * Jupiter does not route anywhere else. The two clusters are therefore both live
 * at once, and each file reads its own URL: crossing them would build a
 * transaction against one chain's blockhash and send it to the other, which
 * simply does not land.
 *
 * The treasury keypair is the same on both, as every keypair is — but its
 * *balance* is not. It needs devnet SOL here, airdropped, or the mint fails on
 * the payout.
 */
function config() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL;
  const treasuryKey = process.env.TREASURY_WALLET_SECRET_KEY;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN;

  if (!rpcUrl) throw new TicketError("NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL is not set.");
  if (!treasuryKey) throw new TicketError("TREASURY_WALLET_SECRET_KEY is not set.");
  // The metadata URI is baked into the asset on chain and can never be changed,
  // so it has to be an absolute URL that will still resolve later. A relative
  // path would mint an NFT pointing at nothing.
  if (!origin) throw new TicketError("NEXT_PUBLIC_APP_ORIGIN is not set.");

  return { rpcUrl, treasuryKey, origin };
}

/** A purchase that did not happen, and why. The UI reports these; anything else
    is a bug. Mirrors `TradeError`. */
export class TicketError extends Error {}

/** The treasury: takes the payment, signs as the ticket's authority, and funds
    the game wallets out of what it takes. */
async function treasury(secretKeyBase58: string): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(getBase58Encoder().encode(secretKeyBase58));
  if (bytes.length !== 64) {
    throw new TicketError(
      `TREASURY_WALLET_SECRET_KEY decodes to ${bytes.length} bytes, expected 64.`,
    );
  }
  return createKeyPairSignerFromBytes(bytes);
}

/* -- instructions, by hand ------------------------------------------------- */

/**
 * A System transfer whose source signs somewhere else.
 *
 * `@solana-program/system` has `getTransferSolInstruction`, and the funding path
 * below uses it — but it takes a `TransactionSigner` as the source, and the
 * buyer is not one. Their key is in their browser: the server knows their
 * address and nothing more, and the signature arrives later when their wallet
 * adds it. There is no signer object to hand over, so the instruction is
 * encoded here instead.
 *
 * The account is still marked as a signer — that is what tells the wallet it
 * must sign, and what makes the transaction invalid until it does.
 *
 * Layout: u32-LE discriminator (2 = Transfer), then u64-LE lamports.
 */
function transferFromUnsignedSource({
  source,
  destination,
  lamports,
}: {
  source: Address;
  destination: Address;
  lamports: bigint;
}) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);

  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: source, role: AccountRole.WRITABLE_SIGNER },
      { address: destination, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

/* -- CreateV1, by hand ----------------------------------------------------- */

/**
 * The Core `CreateV1` instruction, encoded here rather than imported.
 *
 * Metaplex ships this as `@metaplex-foundation/mpl-core`, but that is built on
 * Umi — a second Solana runtime, with its own signers, its own transaction
 * builder and its own notion of a public key. Pulling it in for one instruction
 * would put two entire Solana stacks in the same process and leave every call
 * site converting between them. The instruction is a discriminator, two strings
 * and eight accounts; encoding it is cheaper than adopting a framework.
 *
 * Layout, from the program's own IDL:
 *
 *   u8    discriminator = 0
 *   u8    dataState     = 0   (AccountState — the asset gets a real account
 *                              rather than being compressed into a ledger)
 *   str   name          (u32-LE length prefix, then utf8)
 *   str   uri
 *   opt<vec<plugin>> plugins = Some([])
 *
 * That last field is the one worth spelling out, because the obvious encoding of
 * "no plugins" is wrong. It reads as an `Option`, so `None` — a single zero byte
 * — looks right, and the program will not take it. Metaplex's own serializer
 * defaults the field to an *empty vector*, not to nothing: it writes `Some`,
 * then a vector of length zero. Five bytes, `01 00 00 00 00`.
 *
 * This is not a guess. The bytes this function produces were diffed against
 * `getCreateV1InstructionDataSerializer()` from `@metaplex-foundation/mpl-core`
 * and match it exactly. A hand-rolled instruction is only worth having if it is
 * checked against the real one, and the first draft of this got that tail wrong.
 */
function createV1Instruction({
  asset,
  payer,
  owner,
  authority,
  name,
  uri,
}: {
  asset: KeyPairSigner;
  payer: Address;
  owner: Address;
  authority: KeyPairSigner;
  name: string;
  uri: string;
}) {
  const utf8 = getUtf8Encoder();
  const nameBytes = utf8.encode(name);
  const uriBytes = utf8.encode(uri);

  const data = new Uint8Array(
    // ...the trailing 5 being `Some` plus an empty vector's u32 length. See above.
    1 + 1 + 4 + nameBytes.length + 4 + uriBytes.length + 5,
  );
  const view = new DataView(data.buffer);
  let offset = 0;

  data[offset++] = 0; // discriminator: CreateV1
  data[offset++] = 0; // dataState: AccountState

  view.setUint32(offset, nameBytes.length, true); // borsh strings are u32-LE prefixed
  offset += 4;
  data.set(nameBytes, offset);
  offset += nameBytes.length;

  view.setUint32(offset, uriBytes.length, true);
  offset += 4;
  data.set(uriBytes, offset);
  offset += uriBytes.length;

  data[offset++] = 1; // plugins: Some
  view.setUint32(offset, 0, true); // ...of an empty vector
  offset += 4;

  /* The eight accounts, in the order the program reads them. Order is the ABI —
     there are no names on the wire — so this list is not rearrangeable.

     `collection` and `logWrapper` are unused, and Core's convention for an
     absent optional account is *the program's own ID in that slot*, not a
     shorter list. Omitting them would shift every account after them by one and
     the program would read the payer as the owner. */
  return {
    programAddress: CORE_PROGRAM,
    accounts: [
      // The asset is a fresh keypair and it signs its own creation — a plain
      // account, not a PDA, so the program cannot sign for it. Carrying the
      // `signer` alongside the role is what lets `partiallySign` find it.
      { address: asset.address, role: AccountRole.WRITABLE_SIGNER, signer: asset },
      { address: CORE_PROGRAM, role: AccountRole.READONLY }, // collection: none
      {
        address: authority.address,
        role: AccountRole.READONLY_SIGNER,
        signer: authority,
      },
      { address: payer, role: AccountRole.WRITABLE }, // pays the asset's rent
      { address: owner, role: AccountRole.READONLY }, // ends up holding it
      { address: authority.address, role: AccountRole.READONLY }, // update authority
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: CORE_PROGRAM, role: AccountRole.READONLY }, // logWrapper: none
    ],
    data,
  };
}

/* -- buying ---------------------------------------------------------------- */

export type TicketPurchase = {
  /** Base64 wire transaction, signed by the treasury and the asset, waiting on
      the player. Their wallet adds the last signature and sends it. */
  transaction: string;
  /** The asset being minted, so the browser can say what it is waiting for. */
  asset: string;
  priceSol: number;
};

/**
 * Build the purchase, and sign every part of it the player does not.
 *
 * One transaction, two instructions: the price goes to the treasury, and the
 * ticket is minted to the player. They are inseparable by construction — the
 * player cannot land the payment without the mint or the mint without the
 * payment, because a transaction is all-or-nothing. That is why this is one
 * transaction rather than two, and it is the only part of the flow that gets
 * that guarantee for free.
 *
 * The player pays the rent for their own asset (they are the fee payer, and the
 * `payer` account on the mint), which is why the price has to clear it.
 */
export async function buildPurchase(
  buyerAddress: string,
): Promise<TicketPurchase> {
  const { rpcUrl, treasuryKey, origin } = config();
  const rpc = createSolanaRpc(rpcUrl);

  const buyer = address(buyerAddress);
  const authority = await treasury(treasuryKey);

  // Already holds one? Then this is a double-buy — a reload of a page that
  // already succeeded, most likely — and it must not be allowed to charge again.
  if (await findTicket(buyerAddress)) {
    throw new TicketError("This wallet already holds a World Cup Ticket.");
  }

  const asset = await generateKeyPairSigner();
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    // The player pays the fee. It is their purchase, and it means the treasury
    // does not need SOL on hand for someone else to buy something.
    (m) => setTransactionMessageFeePayer(buyer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          transferFromUnsignedSource({
            source: buyer,
            destination: authority.address,
            lamports: TICKET_PRICE_LAMPORTS,
          }),
          createV1Instruction({
            asset,
            payer: buyer,
            owner: buyer,
            authority,
            name: TICKET_NAME,
            uri: `${origin}/api/ticket/metadata`,
          }),
        ],
        m,
      ),
  );

  /* Sign with everything we hold — the treasury and the freshly generated asset
     — and leave the player's slot empty. `partiallySign` is what allows that:
     the full signer would throw on the missing signature, which is precisely the
     one the wallet is about to add. */
  const signed = await partiallySignTransactionMessageWithSigners(message);

  return {
    transaction: getBase64EncodedWireTransaction(signed),
    asset: asset.address,
    priceSol: TICKET_PRICE_SOL,
  };
}

/* -- ownership ------------------------------------------------------------- */

/**
 * Does this wallet hold a ticket, and which one?
 *
 * Core assets are program-owned accounts rather than SPL tokens, so they do not
 * show up in a token-account query — the owner is a field *inside* the account
 * data, and the only way to ask "who owns what" is to scan the program's
 * accounts for one whose bytes match.
 *
 * The filters do that scan on the RPC's side rather than ours:
 *
 *   - byte 0 is the account discriminator, and `1` is `AssetV1`. Without it the
 *     scan would also return every collection and every plugin registry.
 *   - byte 1 is the owner's 32-byte pubkey — the first field of an AssetV1 after
 *     the discriminator. Matching it there is what makes this "assets owned by
 *     this player" rather than "all assets".
 *
 * Returns the asset's address, or null. Null is the ordinary answer for anyone
 * who has not bought one yet.
 */
export async function findTicket(ownerAddress: string): Promise<string | null> {
  const { rpcUrl, treasuryKey } = config();
  const rpc = createSolanaRpc(rpcUrl);
  const authority = await treasury(treasuryKey);

  const accounts = await rpc
    .getProgramAccounts(CORE_PROGRAM, {
      encoding: "base64",
      filters: [
        // Byte 0 is the account discriminator; AssetV1 is 1, which is "2" in
        // base58. Without this the scan also returns collections and registries.
        {
          memcmp: {
            offset: 0n,
            bytes: "2" as Base58EncodedBytes,
            encoding: "base58",
          },
        },
        // Bytes 1..33 are the owner. This is what makes it *their* assets.
        {
          memcmp: {
            offset: 1n,
            bytes: ownerAddress as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  /* An asset owned by this player and minted by *us*. The update authority sits
     after the owner in the account, and checking it is what stops any Core NFT
     from counting as a ticket — without it, a player who holds an unrelated Core
     asset would read as having paid.

     UpdateAuthority is an enum: 1 byte of tag, then the address when the tag says
     there is one. Tag 1 is `Address`. So the authority's 32 bytes begin at
     1 (discriminator) + 32 (owner) + 1 (tag) = 34. */
  for (const account of accounts) {
    const data = Buffer.from(account.account.data[0], "base64");
    if (data.length < 66) continue;
    if (data[33] !== 1) continue; // update authority is not a plain address

    const updateAuthority = new Uint8Array(data.subarray(34, 66));
    const expected = new Uint8Array(
      getBase58Encoder().encode(authority.address),
    );
    if (Buffer.compare(updateAuthority, expected) === 0) {
      return account.pubkey;
    }
  }

  return null;
}

/* -- funding --------------------------------------------------------------- */

/**
 * Put the 0.05 SOL in their game wallet, if it is not there already.
 *
 * Idempotent, and it has to be: this runs on every home-screen load, and a
 * second payout to a wallet that already has one would be the treasury paying
 * twice for a ticket sold once.
 *
 * "Already there" is decided by the balance rather than by a record of the
 * send, because there is no record — no database, by design. The game wallet is
 * derived, so it starts life empty and stays empty until this funds it; any
 * balance at all means the funding already happened. That is a real assumption
 * and worth naming: a player who *spends* their game wallet down to zero would
 * be funded again on the next load. Nothing in the game spends it yet, so it
 * holds for now, and the day something does, this needs a real ledger.
 */
async function fundGameWallet(ownerAddress: string): Promise<bigint> {
  const { rpcUrl, treasuryKey } = config();
  const rpc = createSolanaRpc(rpcUrl);

  const player = await gameWallet(ownerAddress);
  const { value: balance } = await rpc.getBalance(player.address).send();

  if (BigInt(balance) > 0n) return BigInt(balance);

  const authority = await treasury(treasuryKey);
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(authority.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getTransferSolInstruction({
            source: authority,
            destination: player.address,
            amount: TICKET_FUNDING_LAMPORTS,
          }),
        ],
        m,
      ),
  );

  const signed = await partiallySignTransactionMessageWithSigners(message);

  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();

  // Wait for it, rather than fire and forget — the caller is about to tell the
  // player what their balance is, and an unconfirmed send would have it report
  // zero on the very load that paid it.
  await confirm(rpcUrl, signature);

  return TICKET_FUNDING_LAMPORTS;
}

/* -- the state the home screen shows --------------------------------------- */

export type TicketState = {
  /** Has this wallet bought in? Everything else is only meaningful if it has. */
  hasTicket: boolean;
  /** The asset, for a wallet that holds one. */
  asset: string | null;
  /** Their derived game wallet. Shown whether or not it is funded. */
  gameWallet: string;
  /** Its balance, in lamports, as a string — JSON has no bigint. */
  lamports: string;
  priceSol: number;
};

/**
 * What the player has, reconciled against the chain.
 *
 * This is the read the home screen makes, and it is also the repair: a player
 * who holds a ticket but whose game wallet was never funded — because the
 * server died between the mint and the payout — gets funded right here, on the
 * next load. The NFT is the proof of purchase and it is on-chain, so the debt
 * survives anything that happens to the server. Nothing needs to remember that
 * the payout failed; it is enough to notice that it never landed.
 */
export async function settle(ownerAddress: string): Promise<TicketState> {
  const { rpcUrl } = config();
  const rpc = createSolanaRpc(rpcUrl);

  const asset = await findTicket(ownerAddress);
  const player = await gameWallet(ownerAddress);

  if (!asset) {
    // No ticket, so nothing is owed. Report the wallet anyway — the address is
    // theirs whether or not there is anything in it.
    const { value } = await rpc.getBalance(player.address).send();
    return {
      hasTicket: false,
      asset: null,
      gameWallet: player.address,
      lamports: BigInt(value).toString(),
      priceSol: TICKET_PRICE_SOL,
    };
  }

  const lamports = await fundGameWallet(ownerAddress);

  return {
    hasTicket: true,
    asset,
    gameWallet: player.address,
    lamports: lamports.toString(),
    priceSol: TICKET_PRICE_SOL,
  };
}

/* -- plumbing -------------------------------------------------------------- */

/** Poll until the network has it, or give up. The RPC's own confirmation
    subscriptions need a websocket the route handlers do not have, so this is
    the polled version — a transfer confirms in about a second. */
async function confirm(rpcUrl: string, signature: Signature): Promise<void> {
  const rpc = createSolanaRpc(rpcUrl);

  for (let attempt = 0; attempt < 30; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];

    if (status?.err) {
      throw new TicketError(`Funding transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new TicketError("Funding transaction did not confirm in time.");
}
