"use client";

import { useWalletUi } from "@wallet-ui/react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { CloseTradeResponse } from "@/app/api/trade/close/route";
import type { OpenTradeResponse } from "@/app/api/trade/open/route";

/**
 * The position, from kickoff to the final whistle.
 *
 * It is opened on the start screen and closed on the pitch, and those are two
 * routes — so this sits in the root layout above both of them, exactly as
 * `ReplayProvider` does and for the same reason: navigating between the pages
 * re-renders them under the provider without remounting it, so the ticket
 * survives the trip.
 *
 * Every run that ends closes: the whistle sells the token back into the curve it
 * came from, whether the ball went in or not. What the player wins or loses is what
 * the market did to it in the ninety seconds it was held, and nothing else.
 *
 * The trade itself happens on the server. Nothing here signs anything — but it
 * does have to say *who* the server should sign for: the wallet that pays is
 * derived from the connected address, so the address is sent with the buy. It is
 * the address and only the address; the key never leaves the server, and the
 * browser could not produce it if it wanted to.
 */

/** What the badge is showing, and what the run is doing.
 *
 *  - `idle`      — no position. Before a run, and after one is cleared.
 *  - `opening`   — the buy is in flight. The spinner is up; the badge is not.
 *  - `open`      — bought. The run is live and the money is in the market.
 *  - `closing`   — the sell is in flight. Reached by every run that ends.
 *  - `closed`    — sold. The badge shows what came back.
 *  - `failed`    — the trade did not happen at all. Says why, and the run goes
 *                  on regardless — including when the wallet is too empty to
 *                  fund a position.
 *
 * Every run that ends liquidates, whether or not the ball went in: the whistle
 * sells the position and the player gets back whatever the token did while it
 * was in play. Scoring is not what settles the trade, so there is no state here
 * for a position left unsold.
 *
 * Everything is in lamports, as strings, because that is what the server can
 * honestly say. The token is a random devnet pump.fun mint and nothing prices
 * those, so a dollar figure would be a number the badge made up. */
export type Trade =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "open"; lamportsIn: string; mint: string }
  | { status: "closing"; lamportsIn: string; mint: string }
  | {
      status: "closed";
      lamportsIn: string;
      lamportsOut: string;
      /** lamportsOut - lamportsIn. Negative is a loss, and the badge says so. */
      pnl: string;
      mint: string;
    }
  | { status: "failed"; message: string };

type TradeContext = {
  trade: Trade;
  /** Buy the position. Resolves when the swap has confirmed — the pitch awaits
      this, so the ball does not move over a trade still in flight. */
  open: () => Promise<void>;
  /** Sell it, however the run ended. Never throws: a run that ends is over
      whatever the market did, and a failed sell is reported, not raised. */
  close: () => Promise<void>;
  /** Back to `idle`, for the next run. */
  reset: () => void;
};

const Context = createContext<TradeContext | null>(null);

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [trade, setTrade] = useState<Trade>({ status: "idle" });

  /* Whose wallet pays. The server derives the key from this, so a disconnected
     wallet cannot open a position — there is nobody to spend for.

     Pulled out of the account here rather than read inside `open`, so that what
     the callback closes over is the address itself. Closing over `account` would
     re-create `open` whenever any *other* field of it changed, and the compiler
     rightly refuses to accept a narrower dependency than the one it can see. */
  const { account } = useWalletUi();
  const owner = account?.address;

  /* The ticket names the position on the server. It is deliberately a ref and
     not state: nothing renders it, and putting it in state would re-render the
     whole tree on open for a value only `close` ever reads. */
  const ticket = useRef<string | null>(null);

  /* What the buy actually got, kept beside the ticket for the same reason and
     read by the same caller. `close` used to recover these off `trade.status ===
     "open"`, which made the callback depend on the trade and therefore change
     identity every time the trade moved — and, worse, meant a close fired from
     any status *other* than `open` silently reported a stake of zero against an
     empty mint. The position is a fact about the run, not about what the badge
     currently happens to be showing, so it is held as one. */
  const position = useRef<{ lamportsIn: string; mint: string } | null>(null);

  const open = useCallback(async () => {
    // No wallet, no derived wallet, no trade. The run still happens — the badge
    // says why it happened for nothing.
    if (!owner) {
      setTrade({ status: "failed", message: "Connect a wallet to place a bet." });
      return;
    }

    setTrade({ status: "opening" });

    try {
      const response = await fetch("/api/trade/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner }),
      });
      const body = (await response.json()) as OpenTradeResponse & {
        error?: string;
      };

      if (!response.ok) throw new Error(body.error ?? "Trade failed.");

      /* What was bought, and what it cost. Logged rather than rendered: the badge
         says the number and nothing else, and a mint address on screen would be
         forty-four characters of noise over a game of football. It is here so the
         run can be audited from the console while the mechanic is being tuned. */
      console.log("[trade] bought", body.mint, {
        lamports: body.lamports,
        signature: body.signature,
      });

      ticket.current = body.ticket;
      position.current = { lamportsIn: body.lamports, mint: body.mint };
      setTrade({ status: "open", lamportsIn: body.lamports, mint: body.mint });
    } catch (error) {
      /* A failed buy must not take the game down with it. The run is the
         product; the trade is the garnish. So this resolves rather than throws —
         the badge says the position never opened, and the player still plays. */
      ticket.current = null;
      position.current = null;
      setTrade({
        status: "failed",
        message: error instanceof Error ? error.message : "Trade failed.",
      });
    }
  }, [owner]);

  const close = useCallback(async () => {
    // Nothing to sell: the buy failed, or there was never a position. Either way
    // the run just ended and the badge should not now invent one.
    if (!ticket.current) return;

    const held = ticket.current;
    ticket.current = null;

    // The stake and the token are read off the open position rather than
    // re-derived, so a close is always reported against what was actually paid
    // for what was actually bought.
    const lamportsIn = position.current?.lamportsIn ?? "0";
    const mint = position.current?.mint ?? "";
    setTrade({ status: "closing", lamportsIn, mint });

    try {
      const response = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: held }),
      });
      const body = (await response.json()) as CloseTradeResponse & {
        error?: string;
      };

      if (!response.ok) throw new Error(body.error ?? "Could not close.");

      position.current = null;

      setTrade({
        status: "closed",
        lamportsIn,
        lamportsOut: body.lamports,
        pnl: body.pnl,
        mint: body.mint,
      });
    } catch (error) {
      position.current = null;
      setTrade({
        status: "failed",
        message: error instanceof Error ? error.message : "Could not close.",
      });
    }
  }, []);

  const reset = useCallback(() => {
    ticket.current = null;
    position.current = null;
    setTrade({ status: "idle" });
  }, []);

  return (
    <Context.Provider value={{ trade, open, close, reset }}>
      {children}
    </Context.Provider>
  );
}

export function useTrade(): TradeContext {
  const context = useContext(Context);
  if (!context) {
    throw new Error("useTrade must be used inside a TradeProvider.");
  }
  return context;
}
