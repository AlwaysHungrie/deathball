import "server-only";

import {
  address,
  AccountRole,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Base58EncodedBytes,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { gameWallet } from "@/lib/derive";
import {
  LAMPORTS_PER_SOL as LAMPORTS_PER_SOL_NUMBER,
  STAKE_SOL,
} from "@/lib/stake";

/**
 * The bet the player places on themselves.
 *
 * Every run buys a pump.fun token off its bonding curve at kickoff and sells it
 * back at the final whistle. Two things about that are worth stating plainly,
 * because both are departures from what this file replaced:
 *
 *   1. **The player's own wallet pays.** Not the house's. The signer is the game
 *      wallet derived from their connected address (see `derive.ts`) — the same
 *      one the World Cup Ticket funds with 0.05 SOL. The server holds the key, so
 *      there is still no wallet popup, but the SOL at risk is now theirs.
 *
 *   2. **The token is chosen at random, per run.** Not a fixed mint. Each kickoff
 *      picks a live bonding curve off the pump.fun program and buys that. The
 *      player does not know what they are holding until they are holding it.
 *
 * ## Why the curve and not an aggregator
 *
 * This is devnet, and no aggregator routes here — Jupiter included, which is what
 * the previous version of this file used and why it had to run on mainnet to do
 * it. pump.fun's program *is* deployed on devnet, though, and a bonding curve
 * needs no liquidity router: the price is a function of the reserves in one
 * account, and buying is one instruction against it. So the trade moves to devnet
 * by dropping the aggregator rather than by finding a devnet one.
 *
 * The consequence is that everything here is denominated in SOL, not dollars.
 * There is no price oracle for a devnet token and inventing a USD figure for one
 * would be the badge telling the player something untrue on every single run.
 *
 * Server-only, and it must stay that way: this derives private keys.
 */

/* -- the program ----------------------------------------------------------- */

/**
 * pump.fun, on devnet. Same program ID as mainnet — the program is deployed to
 * both, and it is the *cluster* that makes this devnet, not the address.
 */
const PUMP_PROGRAM = address("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const RENT_SYSVAR = address("SysvarRent111111111111111111111111111111111");

/**
 * The event authority, a PDA of seed `["__event_authority"]`. Anchor programs
 * take it on every instruction that emits an event via CPI, and pump's
 * `buy`/`sell` both do. Hardcoded rather than derived at call time because it is
 * a constant of the program, and deriving a constant on every request is work
 * done to reach a known answer.
 */
const EVENT_AUTHORITY = address("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

/**
 * The global config PDA, seed `["global"]`. Holds the protocol's fee recipient
 * and its fee rate, and `buy` reads both out of it.
 */
const GLOBAL = address("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

/**
 * pump's separate fee program, and the `fee_config` account it owns.
 *
 * The one genuinely counter-intuitive address in this file: `fee_config` is a PDA
 * of the **fee program**, not of pump. Deriving it under pump — which is what
 * every other PDA here does, and what a reasonable person would assume — produces
 * a valid-looking address that the program rejects.
 *
 * Both are constants of the deployment, and both were read out of the on-chain
 * IDL rather than guessed. The seed's second component is a 32-byte constant the
 * IDL carries verbatim; it is not an address, so it is spelled out as bytes.
 */
const FEE_PROGRAM = address("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

const FEE_CONFIG_SEED = new Uint8Array([
  1, 86, 224, 246, 147, 102, 90, 207, 68, 219, 21, 104, 191, 23, 91, 170, 81,
  137, 203, 151, 245, 210, 255, 59, 101, 93, 43, 182, 253, 109, 24, 176,
]);

/**
 * Anchor's 8-byte instruction discriminators: `sha256("global:<name>")[..8]`.
 * These are the published values for pump's `buy` and `sell`.
 */
const BUY_DISCRIMINATOR = new Uint8Array([
  102, 6, 61, 18, 1, 218, 235, 234,
]);
const SELL_DISCRIMINATOR = new Uint8Array([
  51, 230, 133, 164, 1, 127, 131, 173,
]);

/**
 * The `BondingCurve` account, as the program lays it out. 81 bytes:
 *
 *   [0..8]   discriminator (0x17b7f83760d8ac60)
 *   [8..16]  virtual_token_reserves : u64
 *   [16..24] virtual_sol_reserves   : u64
 *   [24..32] real_token_reserves    : u64
 *   [32..40] real_sol_reserves      : u64
 *   [40..48] token_total_supply     : u64
 *   [48]     complete               : bool
 *   [49..81] creator                : pubkey
 *
 * Verified against live devnet accounts rather than taken from an IDL: an
 * untouched curve reads back the launch constants exactly (1073000000000000
 * virtual tokens against 30000000000 virtual lamports), and a traded one shows
 * `real_sol_reserves` moved. If those numbers ever stop matching, this layout is
 * what changed.
 */
const CURVE_SIZE = 81n;
const CURVE_DISCRIMINATOR = "17b7f83760d8ac60";

type Curve = {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  complete: boolean;
  creator: Address;
};

/* -- the numbers ----------------------------------------------------------- */

const LAMPORTS_PER_SOL = BigInt(LAMPORTS_PER_SOL_NUMBER);

const STAKE_LAMPORTS = BigInt(STAKE_SOL * LAMPORTS_PER_SOL_NUMBER);

/**
 * A bonding curve is a fixed function of its own reserves, so there is no
 * slippage in the usual sense — nobody is routing us through a pool that might
 * move. The bound exists because *other people* trade the same curve between our
 * quote and our landing. 5% is loose, and at this size irrelevant.
 */
const SLIPPAGE_BPS = 500n;

/**
 * What the wallet must hold to be allowed to open. The stake, plus the fees on
 * both legs, plus the rent for the token account the buy creates (~0.002 SOL,
 * and it is refunded on nothing — the account stays).
 *
 * A run that opens a position it cannot afford to close is worse than one that
 * never opened, which is the whole reason this is checked against a float rather
 * than against the stake alone.
 */
const MIN_LAMPORTS = STAKE_LAMPORTS + BigInt(0.01 * LAMPORTS_PER_SOL_NUMBER);

/* -- config ---------------------------------------------------------------- */

/**
 * Devnet, and only devnet. The mainnet URL is not read here and must not be:
 * this signs with a key derived from the player's address, and pointing that at
 * mainnet would be the game spending real SOL out of a wallet the player never
 * agreed to hand over.
 *
 * Per call rather than at module load, so a missing URL fails the trade instead
 * of the server — the same reasoning as `ticket.ts`.
 */
function config() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL;
  if (!rpcUrl) {
    throw new TradeError("NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL is not set.");
  }
  return { rpcUrl };
}

/** A trade that did not happen, and why. Distinct from a bug: these are the
    expected failures — no funds, no curve, a swap that did not land — and the UI
    reports them on the badge. */
export class TradeError extends Error {}

/* -- finding something to buy ---------------------------------------------- */

/**
 * The floor for calling a curve "live".
 *
 * The obvious filter is `real_sol_reserves > 0` — somebody, at some point, bought
 * this token — and it is not enough. Devnet is full of curves sitting on *one or
 * two lamports*: a script poked them once and left. They pass a `> 0` test and
 * they are exactly as dead as the ones that fail it, because a curve with two
 * lamports of history has no price action to bet on and barely any depth to fill
 * an order against.
 *
 * A tenth of the stake is the bar. It is arbitrary, and it is the right kind of
 * arbitrary: it asks that somebody put in real money on the same order of
 * magnitude as the money we are about to put in.
 */
const MIN_CURVE_LIQUIDITY = STAKE_LAMPORTS / 10n;

/**
 * A live bonding curve, picked at random.
 *
 * Devnet has upwards of twelve thousand of them and most are dead on arrival:
 * somebody ran a launch script, nobody ever bought, and the curve still sits at
 * its exact launch constants. Buying one of those is legal and pointless — the
 * token has no history and its price cannot have moved, so the wager would be on
 * a number that never changes.
 *
 * What is left after the dead ones — a token somebody actually put SOL into — is
 * the closest thing devnet has to "trending", and it is an honest version of it:
 * a token with a trade in its past rather than a token with a marketing budget.
 * The mainnet notion of trending cannot be had here at all. pump.fun's API indexes
 * mainnet only, and the tokens it would name do not exist on this chain to be
 * bought — so a devnet game that claimed to buy a trending coin would either be
 * lying about the chain or lying about the coin.
 *
 * The scan is done RPC-side as far as it can be. `dataSize` narrows twelve
 * thousand accounts to the bonding curves, and `memcmp` on byte 48 drops the
 * completed ones — a curve that has graduated to an AMM rejects a `buy` outright,
 * and finding that out from a failed transaction is a worse way to learn it than
 * from a filter.
 */
async function pickCurve(rpcUrl: string): Promise<{ curve: Curve; account: Address; mint: Address }> {
  const rpc = createSolanaRpc(rpcUrl);

  const accounts = await rpc
    .getProgramAccounts(PUMP_PROGRAM, {
      encoding: "base64",
      filters: [
        { dataSize: CURVE_SIZE },
        // Byte 48 is `complete`. "1" in base58 is a single zero byte: not
        // complete. A graduated curve cannot be bought from.
        {
          memcmp: {
            offset: 48n,
            bytes: "1" as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  /* Decode, and keep the ones that have seen a real trade. This is done here
     rather than as a third `memcmp` because "greater than zero" is not something
     a memcmp can ask — it matches bytes, not magnitudes. */
  const live: { curve: Curve; account: Address }[] = [];

  for (const account of accounts) {
    const data = Buffer.from(account.account.data[0], "base64");
    if (data.length !== Number(CURVE_SIZE)) continue;
    if (data.subarray(0, 8).toString("hex") !== CURVE_DISCRIMINATOR) continue;

    const curve = decodeCurve(data);
    if (curve.complete) continue;

    /* An untouched launch, or one poked with dust. Either way no trade worth the
       name has happened here and there is nothing to bet on. See
       MIN_CURVE_LIQUIDITY — a plain `> 0` lets thousands of one-lamport curves
       through, and buying one is buying a flat line. */
    if (curve.realSolReserves < MIN_CURVE_LIQUIDITY) continue;

    // It must be able to sell us the tokens. A curve with no real tokens left has
    // nothing to give.
    if (curve.realTokenReserves === 0n) continue;

    live.push({ curve, account: account.pubkey });
  }

  if (live.length === 0) {
    throw new TradeError("No live pump.fun curve on devnet to trade.");
  }

  const chosen = live[Math.floor(Math.random() * live.length)];

  /* The mint is not in the curve account — the curve is a PDA *of* the mint, and
     the relationship only runs that way. So it is read off the curve's associated
     token account instead: the curve holds its own token supply, and the mint of
     that holding is the token. One RPC call, and it is the only way back. */
  const mint = await mintOfCurve(rpcUrl, chosen.account);

  return { ...chosen, mint };
}

function decodeCurve(data: Buffer): Curve {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    virtualTokenReserves: view.getBigUint64(8, true),
    virtualSolReserves: view.getBigUint64(16, true),
    realTokenReserves: view.getBigUint64(24, true),
    realSolReserves: view.getBigUint64(32, true),
    complete: data[48] === 1,
    creator: addressFromBytes(data.subarray(49, 81)),
  };
}

/**
 * Which token does this curve sell?
 *
 * The curve account does not say. It is a PDA derived *from* the mint —
 * `["bonding-curve", mint]` — and a PDA is a one-way function: you cannot read
 * the seeds back out of the address. The link has to be found somewhere else.
 *
 * It is found in the curve's token holdings. A curve custodies the supply of the
 * token it sells, in an associated token account it owns, so asking the RPC what
 * tokens this account holds returns exactly one mint: its own.
 */
async function mintOfCurve(rpcUrl: string, curve: Address): Promise<Address> {
  const rpc = createSolanaRpc(rpcUrl);

  const { value } = await rpc
    .getTokenAccountsByOwner(curve, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed" })
    .send();

  for (const account of value) {
    const mint = account.account.data.parsed.info.mint as string;
    // Sanity: the curve for that mint must be this account. A curve holding some
    // *other* token — airdropped in, most likely — would otherwise be mistaken
    // for the token it sells, and we would buy the wrong thing.
    const derived = await curveOf(address(mint));
    if (derived === curve) return address(mint);
  }

  throw new TradeError("Could not find the mint behind the curve.");
}

/* -- the program's addresses ----------------------------------------------- */

/** `["bonding-curve", mint]`. The curve that sells this token. */
async function curveOf(mint: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PUMP_PROGRAM,
    seeds: [Buffer.from("bonding-curve"), new Uint8Array(getBase58Encoder().encode(mint))],
  });
  return pda;
}

/**
 * `["creator-vault", creator]`. Where the creator's cut of the fee lands.
 *
 * A newer account on pump's `buy` than the rest, and the one most likely to be
 * missing from a stale integration — the instruction grew a slot for it, and an
 * account list built without it shifts everything after it by one.
 */
async function creatorVaultOf(creator: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PUMP_PROGRAM,
    seeds: [Buffer.from("creator-vault"), new Uint8Array(getBase58Encoder().encode(creator))],
  });
  return pda;
}

/**
 * The volume accumulators, and the fee config.
 *
 * These are the accounts that were missing from the first version of this file,
 * and the program said so exactly: `AccountNotEnoughKeys`, naming
 * `global_volume_accumulator`. pump's `buy` has grown to sixteen accounts and its
 * `sell` to fourteen — the twelve that a reading of the older integrations gives
 * you are the right twelve, in the right order, and simply not all of them.
 *
 * The lesson is in the fix: all of this was read out of the program's own
 * on-chain Anchor IDL rather than reconstructed from memory or from a blog post.
 * If pump grows another account, that is where it will say so first.
 */

/** `["global_volume_accumulator"]`. Protocol-wide, so it takes no other seed. */
async function globalVolumeAccumulator(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PUMP_PROGRAM,
    seeds: [Buffer.from("global_volume_accumulator")],
  });
  return pda;
}

/** `["user_volume_accumulator", user]`. Per-trader, and writable — the buy
    updates it. */
async function userVolumeAccumulator(user: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PUMP_PROGRAM,
    seeds: [
      Buffer.from("user_volume_accumulator"),
      new Uint8Array(getBase58Encoder().encode(user)),
    ],
  });
  return pda;
}

/**
 * `["fee_config", <const>]` — under FEE_PROGRAM.
 *
 * Note the program address. This is the one PDA in the file that is *not* derived
 * under pump, and getting that wrong yields an address that looks perfectly
 * plausible and is rejected on chain. See FEE_PROGRAM.
 */
async function feeConfig(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: FEE_PROGRAM,
    seeds: [Buffer.from("fee_config"), FEE_CONFIG_SEED],
  });
  return pda;
}

/** The associated token account: `[owner, TOKEN_PROGRAM, mint]` under the ATA
    program. Where an owner's balance of a given mint actually lives. */
async function associatedTokenAddress(owner: Address, mint: Address): Promise<Address> {
  const encoder = getBase58Encoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [
      new Uint8Array(encoder.encode(owner)),
      new Uint8Array(encoder.encode(TOKEN_PROGRAM)),
      new Uint8Array(encoder.encode(mint)),
    ],
  });
  return pda;
}

/** 32 raw bytes back into an address. The RPC hands out base64 account data, and
    every pubkey inside it arrives as bytes rather than as the base58 the rest of
    the code speaks. */
function addressFromBytes(bytes: Uint8Array | Buffer): Address {
  return address(getBase58Decoder().decode(new Uint8Array(bytes)));
}

/* -- the curve's arithmetic ------------------------------------------------ */

/**
 * How many tokens `lamports` buys, at the curve's current reserves.
 *
 * A constant-product curve: `virtual_sol * virtual_token` is held invariant, so
 * putting SOL in moves the product and the tokens out are whatever keeps it
 * level. This is the program's own formula, reimplemented — the instruction takes
 * the token amount as an *argument* and checks it against a max-cost bound, so
 * the caller has to know the answer before it asks the question.
 *
 * Integer arithmetic throughout, in bigint, because that is what the program
 * does. A float here would round differently from the on-chain check and the
 * transaction would fail on a discrepancy of one base unit.
 */
function tokensFor(curve: Curve, lamports: bigint): bigint {
  if (lamports === 0n) return 0n;

  const product = curve.virtualSolReserves * curve.virtualTokenReserves;
  const newSol = curve.virtualSolReserves + lamports;
  const newToken = product / newSol + 1n;

  const out = curve.virtualTokenReserves - newToken;

  // Never promise more than the curve actually holds. The virtual reserves are
  // larger than the real ones by construction, so the formula can name a number
  // the curve cannot pay.
  return out < curve.realTokenReserves ? out : curve.realTokenReserves;
}

/** And the other way: what `tokens` are worth, sold back into the same curve. */
function lamportsFor(curve: Curve, tokens: bigint): bigint {
  if (tokens === 0n) return 0n;

  const product = curve.virtualSolReserves * curve.virtualTokenReserves;
  const newToken = curve.virtualTokenReserves + tokens;
  const newSol = product / newToken + 1n;

  const out = curve.virtualSolReserves - newSol;

  return out < curve.realSolReserves ? out : curve.realSolReserves;
}

/* -- the instructions, by hand --------------------------------------------- */

/**
 * `buy(amount: u64, max_sol_cost: u64)`. Sixteen accounts.
 *
 * Order is the ABI — there are no names on the wire — so this list is not
 * rearrangeable, and an account missing from the middle of it silently becomes
 * the account after it. Taken verbatim from the program's on-chain IDL, which is
 * the only source for this that cannot go stale.
 */
function buyInstruction({
  buyer,
  mint,
  curve,
  curveAta,
  buyerAta,
  creatorVault,
  feeRecipient,
  buybackRecipients,
  curveV2,
  globalVolume,
  userVolume,
  fees,
  tokens,
  maxLamports,
}: {
  buyer: KeyPairSigner;
  mint: Address;
  curve: Address;
  curveAta: Address;
  buyerAta: Address;
  creatorVault: Address;
  feeRecipient: Address;
  buybackRecipients: Address[];
  curveV2: Address;
  globalVolume: Address;
  userVolume: Address;
  fees: Address;
  tokens: bigint;
  maxLamports: bigint;
}) {
  const data = new Uint8Array(24);
  data.set(BUY_DISCRIMINATOR, 0);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, tokens, true);
  view.setBigUint64(16, maxLamports, true);

  return {
    programAddress: PUMP_PROGRAM,
    accounts: [
      { address: GLOBAL, role: AccountRole.READONLY },
      { address: feeRecipient, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: curve, role: AccountRole.WRITABLE },
      { address: curveAta, role: AccountRole.WRITABLE },
      { address: buyerAta, role: AccountRole.WRITABLE },
      { address: buyer.address, role: AccountRole.WRITABLE_SIGNER, signer: buyer },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: creatorVault, role: AccountRole.WRITABLE },
      { address: EVENT_AUTHORITY, role: AccountRole.READONLY },
      { address: PUMP_PROGRAM, role: AccountRole.READONLY },
      // The four that were missing, and that the program named on its way to
      // rejecting the transaction.
      { address: globalVolume, role: AccountRole.WRITABLE },
      { address: userVolume, role: AccountRole.WRITABLE },
      { address: fees, role: AccountRole.READONLY },
      { address: FEE_PROGRAM, role: AccountRole.READONLY },
      ...remainingAccounts(curveV2, buybackRecipients),
    ],
    data,
  };
}

/**
 * The accounts past the ones the IDL declares — and the reason this file took
 * three failed transactions to get right.
 *
 * They are not in the IDL, so nothing about the declared account list hints that
 * they are needed. The program does not reject them up front either: it validates
 * everything it was given, runs the fee transfers, and only then discovers what is
 * missing — which is why the errors arrive from deep inside `sell.rs` even on a
 * buy, and why the transaction has already done real work by the time it fails.
 *
 * Two rules, both learned the hard way and both confirmed by simulation:
 *
 *   1. **The curve comes first.** Buybacks-then-curve fails with
 *      `InvalidBondingCurveV2`; curve-then-buybacks succeeds. Order is the ABI.
 *
 *   2. **All eight buyback recipients, or none.** Error 6061 says so outright —
 *      "buyback fee recipients require exactly 8 remaining accounts (or none)".
 *      Passing the one that seems to be missing, which is what
 *      `BuybackFeeRecipientMissing` invites you to do, fails every time.
 */
function remainingAccounts(curveV2: Address, buybackRecipients: Address[]) {
  return [
    { address: curveV2, role: AccountRole.WRITABLE },
    ...buybackRecipients.map((address) => ({
      address,
      role: AccountRole.WRITABLE,
    })),
  ];
}

/**
 * `sell(amount: u64, min_sol_output: u64)`. Fourteen accounts.
 *
 * Nearly `buy`'s list, with two differences that are the program's and not
 * mistakes: the token program and the creator vault are transposed relative to
 * `buy`, and the sell takes no volume accumulators — it does not count towards
 * the volume that pump rewards.
 */
function sellInstruction({
  seller,
  mint,
  curve,
  curveAta,
  sellerAta,
  creatorVault,
  feeRecipient,
  buybackRecipients,
  curveV2,
  fees,
  tokens,
  minLamports,
}: {
  seller: KeyPairSigner;
  mint: Address;
  curve: Address;
  curveAta: Address;
  sellerAta: Address;
  creatorVault: Address;
  feeRecipient: Address;
  buybackRecipients: Address[];
  curveV2: Address;
  fees: Address;
  tokens: bigint;
  minLamports: bigint;
}) {
  const data = new Uint8Array(24);
  data.set(SELL_DISCRIMINATOR, 0);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, tokens, true);
  view.setBigUint64(16, minLamports, true);

  return {
    programAddress: PUMP_PROGRAM,
    accounts: [
      { address: GLOBAL, role: AccountRole.READONLY },
      { address: feeRecipient, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: curve, role: AccountRole.WRITABLE },
      { address: curveAta, role: AccountRole.WRITABLE },
      { address: sellerAta, role: AccountRole.WRITABLE },
      { address: seller.address, role: AccountRole.WRITABLE_SIGNER, signer: seller },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: creatorVault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: EVENT_AUTHORITY, role: AccountRole.READONLY },
      { address: PUMP_PROGRAM, role: AccountRole.READONLY },
      { address: fees, role: AccountRole.READONLY },
      { address: FEE_PROGRAM, role: AccountRole.READONLY },
      // As on the buy, and for the same reason: the fee logic the two share is
      // literally where the buy's errors were thrown from. See `remainingAccounts`.
      ...remainingAccounts(curveV2, buybackRecipients),
    ],
    data,
  };
}

/**
 * Create the buyer's token account, if they have never held this mint.
 *
 * They never have — the token is picked at random, so every run is a first
 * encounter — which means this instruction fires on essentially every buy. It is
 * the idempotent variant (`1`), so the one run in ten thousand that draws a token
 * the player already holds does not fail on an account that already exists.
 *
 * The rent it pays is not recoverable. It is a real cost of the trade, and it is
 * why `MIN_LAMPORTS` is well above the stake.
 */
function createAtaInstruction({
  payer,
  owner,
  mint,
  ata,
}: {
  payer: KeyPairSigner;
  owner: Address;
  mint: Address;
  ata: Address;
}) {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    accounts: [
      { address: payer.address, role: AccountRole.WRITABLE_SIGNER, signer: payer },
      { address: ata, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: RENT_SYSVAR, role: AccountRole.READONLY },
    ],
    // CreateIdempotent. A plain Create (0) would fail on the rare repeat draw.
    data: new Uint8Array([1]),
  };
}

/* -- reading the chain ----------------------------------------------------- */

async function readCurve(rpcUrl: string, curve: Address): Promise<Curve> {
  const rpc = createSolanaRpc(rpcUrl);
  const { value } = await rpc.getAccountInfo(curve, { encoding: "base64" }).send();

  if (!value) throw new TradeError("The bonding curve has gone.");

  const data = Buffer.from(value.data[0], "base64");
  return decodeCurve(data);
}

/**
 * The two fee recipients the trade has to pay, read out of the global config.
 *
 * `protocol` is the ordinary one, at byte 41 — after the discriminator, the
 * `initialized` flag and the authority.
 *
 * `buyback` is the one that is easy to miss and fatal to omit. pump has a
 * cashback/buyback scheme, it is *enabled on devnet* (`is_cashback_enabled` at
 * byte 740), and when it is on, the program demands a recipient from the
 * `buyback_fee_recipients` array that begins at byte 741. It is not in the IDL's
 * declared account list, so it has to be passed as a trailing *remaining account*
 * — and leaving it off does not fail validation up front. It fails deep inside,
 * after the fee transfers have already run, with `BuybackFeeRecipientMissing`.
 *
 * Eight of them, and any one will do: they are alternates, not slots. Picking at
 * random spreads the writes, which matters only in that two runs landing in the
 * same slot on the same recipient would contend for the same account.
 *
 * The offsets are hard-coded because `Global` is a fixed-layout Anchor account
 * and the alternative — decoding a 1045-byte struct to reach two pubkeys — is a
 * great deal of machinery for a constant. They were read off the on-chain IDL,
 * which is the only reason they are right.
 */
async function feeRecipients(
  rpcUrl: string,
): Promise<{ protocol: Address; buyback: Address[] }> {
  const rpc = createSolanaRpc(rpcUrl);
  const { value } = await rpc.getAccountInfo(GLOBAL, { encoding: "base64" }).send();

  if (!value) throw new TradeError("pump.fun's global config is missing.");

  const data = Buffer.from(value.data[0], "base64");

  const BUYBACK_RECIPIENTS_OFFSET = 741;
  const BUYBACK_RECIPIENT_COUNT = 8;

  /* All eight, in the order the array holds them. Not a choice of one: the
     program's own error 6061 puts it plainly — "buyback fee recipients require
     exactly 8 remaining accounts (or none)". Passing a single recipient, which is
     the intuitive reading of a "missing recipient" error, fails every time. */
  const buyback: Address[] = [];
  for (let i = 0; i < BUYBACK_RECIPIENT_COUNT; i++) {
    const at = BUYBACK_RECIPIENTS_OFFSET + i * 32;
    buyback.push(addressFromBytes(data.subarray(at, at + 32)));
  }

  return {
    protocol: addressFromBytes(data.subarray(41, 73)),
    buyback,
  };
}

/**
 * `["bonding-curve-v2", mint]`.
 *
 * The first of the remaining accounts, and it must come *before* the eight
 * buyback recipients — the order is the ABI here as much as it is in the declared
 * list, and putting the eight first fails with `InvalidBondingCurveV2`.
 *
 * The account does not exist. pump derives this slot, finds nothing there, and
 * proceeds — the curves this game trades are v1, and their v2 PDA has never been
 * initialised. It is a required *slot*, not a required account, which is exactly
 * why the failure it causes reads as a missing account rather than a missing one.
 */
async function bondingCurveV2Of(mint: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PUMP_PROGRAM,
    seeds: [Buffer.from("bonding-curve-v2"), new Uint8Array(getBase58Encoder().encode(mint))],
  });
  return pda;
}

/** What this owner holds of this mint, in base units. Zero if the account does
    not exist, which is the ordinary answer before a first buy. */
async function tokenBalance(
  rpcUrl: string,
  owner: Address,
  mint: Address,
): Promise<bigint> {
  const rpc = createSolanaRpc(rpcUrl);

  const { value } = await rpc
    .getTokenAccountsByOwner(owner, { mint }, { encoding: "jsonParsed" })
    .send();

  let total = 0n;
  for (const account of value) {
    total += BigInt(account.account.data.parsed.info.tokenAmount.amount);
  }
  return total;
}

/**
 * The wallet has to cover the stake, the fees on both legs, *and* the rent on the
 * token account the buy creates. Checked against a float rather than the stake
 * alone, for the reason given at `MIN_LAMPORTS`.
 *
 * This wallet drains. Every run round-trips the curve, and a round trip pays pump's
 * fee twice and the network's twice, so a session of runs where the token did
 * nothing at all still grinds the balance down — an empty wallet is where a long
 * session *ends up*, not a sign that anything is broken. The throw becomes an
 * `ERROR` badge and the football goes on unwagered.
 *
 * It is the player's wallet now, though, which changes what this message means.
 * It used to say the house was out of money. It now says *they* are, and the way
 * to fix it is another ticket.
 */
async function assertFunded(rpcUrl: string, owner: Address): Promise<void> {
  const rpc = createSolanaRpc(rpcUrl);
  const { value } = await rpc.getBalance(owner).send();

  if (BigInt(value) < MIN_LAMPORTS) {
    throw new TradeError("Your game wallet is out of SOL — playing for nothing.");
  }
}

/* -- the two legs ---------------------------------------------------------- */

/** A position, as the game holds it between kickoff and the final whistle. */
export type Position = {
  /** Whose wallet it was bought with. The close leg re-derives the same key from
      this, so a ticket cannot be used to sell somebody else's position. */
  owner: string;
  /** What was bought. Different every run — that is the game. */
  mint: string;
  /** The curve it was bought from, so the close does not have to find it again. */
  curve: string;
  /** Base units of the token actually received. What the close leg sells. */
  tokens: string;
  /** Lamports actually spent, fees and rent included. */
  lamports: string;
  signature: string;
};

/**
 * Buy the stake's worth of a token nobody chose.
 *
 * The curve is picked, quoted, and bought in one pass, and the quote is computed
 * from the reserves we just read rather than asked for — a bonding curve has no
 * quote endpoint, it has arithmetic. The `max_sol_cost` bound is what protects
 * the buy from the curve moving under it between the read and the landing.
 */
export async function openPosition(ownerAddress: string): Promise<Position> {
  const { rpcUrl } = config();

  // Their wallet, not the house's. Derived from the address they connected with.
  const player = await gameWallet(ownerAddress);

  await assertFunded(rpcUrl, player.address);

  const { curve, account: curveAccount, mint } = await pickCurve(rpcUrl);

  const tokens = tokensFor(curve, STAKE_LAMPORTS);
  if (tokens === 0n) {
    throw new TradeError("The curve cannot fill an order this small.");
  }

  // What we are willing to pay for them. The curve is deterministic, so the only
  // thing that can move the price is somebody else trading it in the same slot.
  const maxLamports = STAKE_LAMPORTS + (STAKE_LAMPORTS * SLIPPAGE_BPS) / 10_000n;

  const [
    buyerAta,
    curveAta,
    creatorVault,
    fee,
    globalVolume,
    userVolume,
    fees,
    curveV2,
  ] = await Promise.all([
    associatedTokenAddress(player.address, mint),
    associatedTokenAddress(curveAccount, mint),
    creatorVaultOf(curve.creator),
    feeRecipients(rpcUrl),
    globalVolumeAccumulator(),
    userVolumeAccumulator(player.address),
    feeConfig(),
    bondingCurveV2Of(mint),
  ]);

  const before = await balanceOf(rpcUrl, player.address);

  const signature = await send(rpcUrl, player, [
    createAtaInstruction({
      payer: player,
      owner: player.address,
      mint,
      ata: buyerAta,
    }),
    buyInstruction({
      buyer: player,
      mint,
      curve: curveAccount,
      curveAta,
      buyerAta,
      creatorVault,
      feeRecipient: fee.protocol,
      buybackRecipients: fee.buyback,
      curveV2,
      globalVolume,
      userVolume,
      fees,
      tokens,
      maxLamports,
    }),
  ]);

  /* What was actually received, read back off the chain rather than assumed from
     the quote. The quote is a prediction and this is the fill — and the close leg
     sells this number, so getting it from anywhere but the chain would have the
     sell naming tokens the wallet might not hold. */
  const held = await tokenBalance(rpcUrl, player.address, mint);
  const after = await balanceOf(rpcUrl, player.address);

  return {
    owner: ownerAddress,
    mint,
    curve: curveAccount,
    tokens: held.toString(),
    // The true cost, fees and the token account's rent included — which is why it
    // is a balance difference and not the stake.
    lamports: (before - after).toString(),
    signature,
  };
}

/** What the goal was worth: the SOL back, and the SOL made or lost. */
export type Close = {
  /** Lamports returned by the sell. */
  lamports: string;
  /** Against what the open leg cost. Negative is a loss, and the badge says so. */
  pnl: string;
  signature: string;
  mint: string;
};

/**
 * Cash out. Sells this run's token, out of this run's wallet.
 *
 * It sells that mint's *entire* balance rather than the exact figure the open
 * leg recorded, which sounds like the dangerous version of this and is not: the
 * token was picked at random, so the odds that the player already held it are
 * negligible, and the balance is therefore this run's position and nothing else.
 *
 * What it deliberately does *not* do is sell everything in the wallet. The old
 * version did — one fixed token, one house wallet, so a goal could cash out every
 * position that past deaths had stranded, and the stake was really "five cents
 * plus everything you have already failed to win back". That mechanic does not
 * survive a random token per run: each dead run strands a *different* mint, and a
 * goal can only rescue its own. The pile is still there in the wallet; it is just
 * no longer collectable in one swap.
 */
export async function closePosition(position: Position): Promise<Close> {
  const { rpcUrl } = config();

  /* Re-derived from the position's own record of who opened it — not from
     anything the browser sent. A ticket is opaque and single-use, but this is the
     belt to that braces: even a forged one could only ever sell a position back
     into the wallet that opened it. */
  const player = await gameWallet(position.owner);

  const mint = address(position.mint);
  const curveAccount = address(position.curve);

  const holding = await tokenBalance(rpcUrl, player.address, mint);

  // The buy confirmed, so the wallet holds at least this run's tokens. A zero here
  // means the chain disagrees with the fill we recorded, and selling nothing would
  // be reported to the player as a settled position worth nothing.
  if (holding === 0n) {
    throw new TradeError("The wallet holds none of the token to sell.");
  }

  // Re-read: the curve has moved since the buy. That movement *is* the wager.
  const curve = await readCurve(rpcUrl, curveAccount);

  const expected = lamportsFor(curve, holding);
  const minLamports = expected - (expected * SLIPPAGE_BPS) / 10_000n;

  const [sellerAta, curveAta, creatorVault, fee, fees, curveV2] = await Promise.all([
    associatedTokenAddress(player.address, mint),
    associatedTokenAddress(curveAccount, mint),
    creatorVaultOf(curve.creator),
    feeRecipients(rpcUrl),
    feeConfig(),
    bondingCurveV2Of(mint),
  ]);

  const before = await balanceOf(rpcUrl, player.address);

  const signature = await send(rpcUrl, player, [
    sellInstruction({
      seller: player,
      mint,
      curve: curveAccount,
      curveAta,
      sellerAta,
      creatorVault,
      feeRecipient: fee.protocol,
      buybackRecipients: fee.buyback,
      curveV2,
      fees,
      tokens: holding,
      minLamports: minLamports > 0n ? minLamports : 0n,
    }),
  ]);

  const after = await balanceOf(rpcUrl, player.address);
  const back = after - before;

  return {
    lamports: back.toString(),
    // Against what this run actually paid, fees and all. The honest number.
    pnl: (back - BigInt(position.lamports)).toString(),
    signature,
    mint: position.mint,
  };
}

/* -- plumbing -------------------------------------------------------------- */

async function balanceOf(rpcUrl: string, owner: Address): Promise<bigint> {
  const rpc = createSolanaRpc(rpcUrl);
  const { value } = await rpc.getBalance(owner).send();
  return BigInt(value);
}

/**
 * Build it, sign it, send it, and wait for the network to take it.
 *
 * The wait is not optional. The badge tells the player what their position did,
 * and the pitch does not move until the buy has landed — a run playing over an
 * unconfirmed trade is a run that might be wagering nothing.
 */
async function send(
  rpcUrl: string,
  signer: KeyPairSigner,
  instructions: ReturnType<typeof buyInstruction>[] | object[],
): Promise<string> {
  const rpc = createSolanaRpc(rpcUrl);
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(signer.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstructions(
        instructions as Parameters<typeof appendTransactionMessageInstructions>[0],
        m,
      ),
  );

  const signed = await signTransactionMessageWithSigners(message);

  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();

  await confirm(rpcUrl, signature);
  return signature;
}

/** Poll until the network has it, or give up. Same as `ticket.ts` and for the
    same reason: the RPC's confirmation subscriptions want a websocket that a
    route handler does not have. */
async function confirm(rpcUrl: string, signature: Signature): Promise<void> {
  const rpc = createSolanaRpc(rpcUrl);

  for (let attempt = 0; attempt < 40; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];

    if (status?.err) {
      throw new TradeError(`The swap failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new TradeError("The swap did not confirm in time.");
}
