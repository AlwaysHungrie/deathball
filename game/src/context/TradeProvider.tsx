"use client";

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
 * The trade itself happens on the server. Nothing here signs anything; this
 * holds the state of a trade someone else is making, and gives the badge
 * something to animate.
 */

/** What the badge is showing, and what the run is doing.
 *
 *  - `idle`      — no position. Before a run, and after one is cleared.
 *  - `opening`   — the buy is in flight. The badge is on screen, ticking down.
 *  - `open`      — bought. The run is live and the money is in the market.
 *  - `closing`   — the sell is in flight. Only ever reached by scoring.
 *  - `closed`    — sold. The badge shows what came back.
 *  - `lost`      — he died, so the position was never sold. The five cents are
 *                  gone: the tokens sit in the wallet and the SOL that bought
 *                  them does not come back. This is the cost of missing.
 *  - `failed`    — the trade did not happen at all. Says why, and the run goes
 *                  on regardless — including when the wallet is too empty to
 *                  fund a position, which is a normal end state here rather than
 *                  an error, because deaths drain it. */
export type Trade =
  | { status: "idle" }
  | { status: "opening" }
  | { status: "open"; usdIn: number }
  | { status: "closing"; usdIn: number }
  | {
      status: "closed";
      usdIn: number;
      /** The whole pile, cashed out — this run's stake plus every dead one. */
      usdOut: number;
      pnl: number;
      /** Dead positions this goal rescued. Zero on a clean run. */
      rescued: number;
    }
  | { status: "lost"; usdIn: number }
  | { status: "failed"; message: string };

type TradeContext = {
  trade: Trade;
  /** Buy the position. Resolves when the swap has confirmed — the pitch awaits
      this, so the ball does not move over a trade still in flight. */
  open: () => Promise<void>;
  /** Sell it. Called *only* on a goal. Never throws: a run that ends is over
      whatever the market did, and a failed sell is reported, not raised. */
  close: () => Promise<void>;
  /**
   * Walk away from it. Called when he dies.
   *
   * The position is not sold and the ticket is dropped, so the tokens stay in
   * the wallet and the SOL spent on them is simply gone. Nothing is sent — this
   * is the *absence* of a transaction, which is exactly what makes the goal
   * worth something.
   */
  abandon: () => void;
  /** Back to `idle`, for the next run. */
  reset: () => void;
};

const Context = createContext<TradeContext | null>(null);

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [trade, setTrade] = useState<Trade>({ status: "idle" });

  /* The ticket names the position on the server. It is deliberately a ref and
     not state: nothing renders it, and putting it in state would re-render the
     whole tree on open for a value only `close` ever reads. */
  const ticket = useRef<string | null>(null);

  const open = useCallback(async () => {
    setTrade({ status: "opening" });

    try {
      const response = await fetch("/api/trade/open", { method: "POST" });
      const body = (await response.json()) as OpenTradeResponse & {
        error?: string;
      };

      if (!response.ok) throw new Error(body.error ?? "Trade failed.");

      ticket.current = body.ticket;
      setTrade({ status: "open", usdIn: body.usdIn });
    } catch (error) {
      /* A failed buy must not take the game down with it. The run is the
         product; the trade is the garnish. So this resolves rather than throws —
         the badge says the position never opened, and the player still plays. */
      ticket.current = null;
      setTrade({
        status: "failed",
        message: error instanceof Error ? error.message : "Trade failed.",
      });
    }
  }, []);

  const close = useCallback(async () => {
    // Nothing to sell: the buy failed, or there was never a position. Either way
    // the run just ended and the badge should not now invent one.
    if (!ticket.current) return;

    const held = ticket.current;
    ticket.current = null;

    // The stake is read off the open position rather than re-derived, so a close
    // is always reported against what was actually paid.
    const usdIn = trade.status === "open" ? trade.usdIn : 0;
    setTrade({ status: "closing", usdIn });

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

      setTrade({
        status: "closed",
        usdIn,
        usdOut: body.usdOut,
        pnl: body.pnl,
        rescued: body.rescued,
      });
    } catch (error) {
      setTrade({
        status: "failed",
        message: error instanceof Error ? error.message : "Could not close.",
      });
    }
  }, [trade]);

  /**
   * He died. The position is left where it is.
   *
   * No request, no swap, nothing sent — the ticket is simply dropped. The server
   * holds it for a few more minutes and then sweeps it (see `positions.ts`), and
   * the tokens it named stay in the wallet unsold. That is the whole of the
   * penalty, and it is a real one: the SOL that bought them is not coming back.
   *
   * Synchronous, precisely because there is nothing to await. A death costs the
   * player nothing in time — only in money.
   */
  const abandon = useCallback(() => {
    if (!ticket.current) return;
    ticket.current = null;

    setTrade((held) =>
      // Only a position that was actually open can be lost. If the buy failed,
      // there is nothing to abandon and the badge keeps saying so — telling the
      // player they lost five cents they never spent would be a lie.
      held.status === "open" ? { status: "lost", usdIn: held.usdIn } : held,
    );
  }, []);

  const reset = useCallback(() => {
    ticket.current = null;
    setTrade({ status: "idle" });
  }, []);

  return (
    <Context.Provider value={{ trade, open, close, abandon, reset }}>
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
