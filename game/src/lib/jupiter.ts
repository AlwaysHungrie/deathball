import "server-only";

import {
  address,
  createKeyPairSignerFromBytes,
  getBase58Encoder,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  signTransaction,
  type KeyPairSigner,
  type Transaction,
} from "@solana/kit";
import { STAKE_USD } from "@/lib/stake";

/**
 * The bet the game places on itself.
 *
 * Every run opens with $0.05 of SOL swapped into a volatile token and closes by
 * swapping the whole of that position back. The player never signs: the game
 * owns a keypair and signs both legs itself, which is the only way the trade can
 * confirm without a wallet popup interrupting the kickoff.
 *
 * That also means the SOL at risk is the house's, not the player's. The player's
 * connected wallet is identity — it gates the START button, and nothing more.
 *
 * Server-only, and it must stay that way: the secret key is read from the
 * environment in this module. Nothing here may be imported from a client
 * component, and the routes that use it hand the browser amounts, not keys.
 */

/** Wrapped SOL. The swap route's input on the way in, and its output on the way out. */
const SOL_MINT = "So11111111111111111111111111111111111111112";

/** BONK. Liquid enough to round-trip $0.05 without the route falling over, and
    volatile enough that the number coming back is not the number that went in. */
export const TRADE_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * A round trip through a memecoin pool costs more than a round trip through a
 * stable pair, and a $0.05 order is small enough that a tight slippage bound
 * fails on ordinary pool noise rather than on anything worth protecting against.
 * 3% is loose for a swap and irrelevant at this size: the most it can cost is
 * fifteen hundredths of a cent.
 */
const SLIPPAGE_BPS = 300;

const API_ORIGIN = "https://api.jup.ag";

/* -- config ---------------------------------------------------------------- */

/**
 * Everything the trade needs from the environment, or a clear reason it cannot
 * run. Called on every request rather than at module load: a missing key must
 * fail the trade, not the whole server.
 */
function config() {
  const apiKey = process.env.JUPITER_API_KEY;
  const secretKey = process.env.TRADE_WALLET_SECRET_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL;

  if (!apiKey) throw new TradeError("JUPITER_API_KEY is not set.");
  if (!secretKey) throw new TradeError("TRADE_WALLET_SECRET_KEY is not set.");
  if (!rpcUrl) throw new TradeError("NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL is not set.");

  return { apiKey, secretKey, rpcUrl };
}

/** A trade that did not happen, and why. Distinct from a bug: these are the
    expected failures — no key, no route, no SOL — and the UI reports them. */
export class TradeError extends Error {}

/* -- wallet ---------------------------------------------------------------- */

/**
 * The game's trading wallet. Base58 64-byte secret key, as
 * `scripts/txline-subscribe.mjs --generate` prints — the same format, so a key
 * from that script can be pasted straight in.
 *
 * This is deliberately its own variable rather than a reuse of
 * TXLINE_WALLET_SECRET_KEY: that wallet is subscribed on devnet, and Jupiter
 * only routes on mainnet. Pointing both at one key is a decision to make on
 * purpose, not one to inherit by accident.
 */
async function wallet(secretKeyBase58: string): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(getBase58Encoder().encode(secretKeyBase58));
  if (bytes.length !== 64) {
    throw new TradeError(
      `TRADE_WALLET_SECRET_KEY decodes to ${bytes.length} bytes, expected 64.`,
    );
  }
  return createKeyPairSignerFromBytes(bytes);
}

/* -- Jupiter --------------------------------------------------------------- */

/** The order, as `/swap/v2/order` sends it. Only the fields we read. */
type Order = {
  /** Base64 v0 transaction, unsigned. Null when no taker was given, and an empty
      string when the router could not price the swap — see the guard below. */
  transaction: string | null;
  requestId: string;
  /** Output the router expects, before slippage. Base units of the output mint. */
  outAmount?: string;
  errorCode?: number;
  errorMessage?: string;
};

/** The result, as `/swap/v2/execute` sends it. */
type Execution = {
  status: "Success" | "Failed";
  signature?: string;
  code: number;
  /** What actually went in and came out, in base units. The whole point: the
      quote is a guess and this is the fill. */
  inputAmountResult?: string;
  outputAmountResult?: string;
  error?: string;
};

async function jupiter<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: { "x-api-key": apiKey, ...init?.headers },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new TradeError(
      `Jupiter ${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

/**
 * One swap, start to finish: price it, sign it, and let Jupiter land it.
 *
 * `/execute` submits the transaction itself, so there is no RPC send here and no
 * confirmation poll — the call returns once the network has taken it, and the
 * amounts it reports are the fill rather than the quote.
 */
async function swap(
  signer: KeyPairSigner,
  apiKey: string,
  { inputMint, outputMint, amount }: {
    inputMint: string;
    outputMint: string;
    /** Base units of the input mint. Lamports for SOL. */
    amount: bigint;
  },
): Promise<{ signature: string; inAmount: bigint; outAmount: bigint }> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    taker: signer.address,
    slippageBps: String(SLIPPAGE_BPS),
  });

  const order = await jupiter<Order>(apiKey, `/swap/v2/order?${params}`);

  // An empty-string transaction is how the router says it could not price this:
  // no route, or a size below what any pool will take. It arrives with a 200, so
  // it has to be caught here rather than by the status check above.
  if (!order.transaction) {
    throw new TradeError(
      order.errorMessage ?? "Jupiter returned no route for this swap.",
    );
  }

  /* Sign. Kit decodes the wire bytes into a transaction, signs it with the
     keypair, and re-encodes — the message is never rebuilt, so what gets signed
     is byte-for-byte what the router assembled. Rebuilding it would invalidate
     the requestId that /execute matches against. */
  const wire = new Uint8Array(getBase64Encoder().encode(order.transaction));
  const decoded: Transaction = getTransactionDecoder().decode(wire);
  const signed = await signTransaction([signer.keyPair], decoded);
  const signedTransaction = Buffer.from(
    getTransactionEncoder().encode(signed),
  ).toString("base64");

  const result = await jupiter<Execution>(apiKey, "/swap/v2/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
  });

  if (result.status !== "Success" || !result.signature) {
    throw new TradeError(
      `Swap failed (code ${result.code}): ${result.error ?? "unknown"}`,
    );
  }

  return {
    signature: result.signature,
    inAmount: BigInt(result.inputAmountResult ?? amount.toString()),
    outAmount: BigInt(result.outputAmountResult ?? "0"),
  };
}

/* -- prices ---------------------------------------------------------------- */

/** USD per whole token, and how many base units make one. */
type Priced = { usdPrice: number; decimals: number };

/**
 * What the market says these mints are worth, right now.
 *
 * Both legs are priced from this rather than from the swap's own quote, so the
 * dollar figure the player sees is a market price and not a route's opinion of
 * one. A mint with no reliable price is omitted from the response entirely —
 * hence the explicit check, rather than trusting the shape.
 */
async function prices(
  apiKey: string,
  mints: string[],
): Promise<Record<string, Priced>> {
  const quoted = await jupiter<Record<string, Priced | undefined>>(
    apiKey,
    `/price/v3?ids=${mints.join(",")}`,
  );

  const found: Record<string, Priced> = {};
  for (const mint of mints) {
    const price = quoted[mint];
    if (!price?.usdPrice) {
      throw new TradeError(`Jupiter has no price for ${mint}.`);
    }
    found[mint] = price;
  }
  return found;
}

/* -- the two legs ---------------------------------------------------------- */

/** A position, as the game holds it between kickoff and the final whistle. */
export type Position = {
  /** Base units of TRADE_MINT actually received. What the close leg sells. */
  tokens: string;
  /** Lamports of SOL actually spent. */
  lamports: string;
  /** What that was worth in dollars when it was bought. Should be ~STAKE_USD. */
  usdIn: number;
  signature: string;
};

/**
 * Buy $0.05 of the token, paying in SOL.
 *
 * The stake is a dollar amount but the swap takes lamports, so the SOL price is
 * fetched first and the amount derived from it. The alternative — quoting a
 * fixed lamport amount — would drift with the SOL price into a stake that is not
 * five cents, and five cents is the mechanic.
 */
export async function openPosition(): Promise<Position> {
  const { apiKey, secretKey, rpcUrl } = config();
  const signer = await wallet(secretKey);

  await assertFunded(signer.address, rpcUrl);

  const quoted = await prices(apiKey, [SOL_MINT]);
  const solUsd = quoted[SOL_MINT].usdPrice;
  const lamports = BigInt(Math.round((STAKE_USD / solUsd) * LAMPORTS_PER_SOL));

  const filled = await swap(signer, apiKey, {
    inputMint: SOL_MINT,
    outputMint: TRADE_MINT,
    amount: lamports,
  });

  return {
    tokens: filled.outAmount.toString(),
    lamports: filled.inAmount.toString(),
    // Priced off what was actually spent, not what we intended to spend — the
    // fill is the truth, and the badge should not claim a round five cents if
    // the route took slightly more.
    usdIn: (Number(filled.inAmount) / LAMPORTS_PER_SOL) * solUsd,
    signature: filled.signature,
  };
}

/** What the goal was worth: the dollars back, and the dollars made or lost. */
export type Close = {
  usdOut: number;
  /** usdOut - usdIn. Negative is a loss, and the badge says so. */
  pnl: number;
  signature: string;
  /**
   * Positions cashed out beyond this run's own — one per past death. Zero on a
   * clean run; the badge uses it to say what the goal actually rescued.
   */
  rescued: number;
};

/**
 * Everything the wallet holds, in base units of the traded token.
 *
 * Read from chain rather than tracked in memory, because the whole point is to
 * catch what memory *lost*: a position abandoned by a death has had its ticket
 * dropped, and the only remaining record that it ever existed is the tokens
 * themselves sitting in the wallet.
 */
async function tokenBalance(owner: string, rpcUrl: string): Promise<bigint> {
  const { createSolanaRpc } = await import("@solana/kit");
  const rpc = createSolanaRpc(rpcUrl);

  const { value } = await rpc
    .getTokenAccountsByOwner(
      address(owner),
      { mint: address(TRADE_MINT) },
      { encoding: "jsonParsed" },
    )
    .send();

  // One associated account in practice, but the RPC returns a list and summing it
  // is both correct and free.
  let total = 0n;
  for (const account of value) {
    total += BigInt(account.account.data.parsed.info.tokenAmount.amount);
  }
  return total;
}

/**
 * Cash out. Sells the wallet's *entire* holding of the token, not just the
 * tokens this run bought.
 *
 * That difference is the game. A run that ends without a goal abandons its
 * position — the tokens stay in the wallet and the ticket naming them is thrown
 * away — so the wallet accumulates a pile of dead positions, one per death. A
 * goal sells the pile. Every nickel lost to a previous miss comes back with it.
 *
 * So the stake is not really five cents; it is five cents *plus everything you
 * have already failed to win back*. Dying twice and then scoring returns fifteen
 * cents' worth of token. Dying twenty times and then scoring returns a dollar's.
 * The longer the drought, the bigger the pot riding on the next shot — and the
 * game gets more expensive to lose the longer you have been losing.
 *
 * This is safe here *only because the wallet is the house's and one run happens
 * at a time*. It is exactly the "sell the balance" that the per-ticket version
 * was written to avoid: with two players on one wallet, whoever scored first
 * would cash out the other's open position from under them. There is one player.
 */
export async function closePosition(position: Position): Promise<Close> {
  const { apiKey, secretKey, rpcUrl } = config();
  const signer = await wallet(secretKey);

  const holding = await tokenBalance(signer.address, rpcUrl);

  // The buy confirmed, so the wallet holds at least this run's tokens. A zero
  // here means the chain disagrees with the fill we were told about, and selling
  // nothing would be reported to the player as a settled position worth $0.
  if (holding === 0n) {
    throw new TradeError("The wallet holds none of the token to sell.");
  }

  const filled = await swap(signer, apiKey, {
    inputMint: TRADE_MINT,
    outputMint: SOL_MINT,
    amount: holding,
  });

  const quoted = await prices(apiKey, [SOL_MINT]);
  const solUsd = quoted[SOL_MINT].usdPrice;
  const usdOut = (Number(filled.outAmount) / LAMPORTS_PER_SOL) * solUsd;

  /* How many *other* positions this goal rescued, on top of its own. Derived from
     the tokens rather than counted, because the deaths that stranded them left no
     record anywhere else — the ticket was dropped and the server swept it.

     It is a ratio of token amounts, so it holds regardless of what BONK did in
     the meantime: each dead position was itself ~$0.05 of token at the price it
     was bought at, and the pile is however many of those there are. Rounded,
     because prices moved between them and the ratio will not be exactly whole. */
  const own = BigInt(position.tokens);
  const rescued = own > 0n ? Math.max(0, Math.round(Number(holding - own) / Number(own))) : 0;

  return {
    usdOut,
    // Against what *this run* staked. The rescued positions were already written
    // off as lost, so counting them as a cost again here would report a hundred
    // percent loss on a goal that just handed the money back.
    pnl: usdOut - position.usdIn,
    signature: filled.signature,
    rescued,
  };
}

/**
 * The wallet has to cover the stake *and* the fees on both legs, so the check is
 * made against a float rather than against the stake alone. A run that opens a
 * position it cannot afford to close is worse than one that never opened.
 *
 * This wallet drains. Every run that ends without a goal abandons its position —
 * the tokens are never sold and the SOL that bought them is gone — so an empty
 * wallet is where a long session *ends up*, not a sign that something is broken.
 * Which is why running dry is not an error the player has to care about: the
 * throw here becomes a `NO TRADE` badge, and the football goes on without a
 * wager on it. Top the wallet up to start betting again.
 */
const MIN_LAMPORTS = BigInt(0.01 * LAMPORTS_PER_SOL);

async function assertFunded(owner: string, rpcUrl: string): Promise<void> {
  const { createSolanaRpc } = await import("@solana/kit");
  const rpc = createSolanaRpc(rpcUrl);
  const { value } = await rpc.getBalance(address(owner)).send();

  if (BigInt(value) < MIN_LAMPORTS) {
    // Written for the player, not the operator — this is a thing they will
    // routinely see, and "AccountNotFunded" on a game-over screen is nobody's
    // idea of a message.
    throw new TradeError("Wallet is out of SOL — playing for nothing.");
  }
}
