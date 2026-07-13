"use client";

import {
  getBase58Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  type Transaction,
} from "@solana/kit";
import {
  useWalletUi,
  useWalletUiSigner,
  type UiWalletAccount,
} from "@wallet-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { MintTicketResponse } from "@/app/api/ticket/mint/route";
import type { TicketStatusResponse } from "@/app/api/ticket/status/route";

/**
 * The player's ticket, and the game wallet it pays for.
 *
 * This is what the home screen shows in place of a wallet balance: whether they
 * have bought in, and — if they have — what is in the wallet the game plays
 * with. Their own SOL balance is not interesting, because their own SOL is not
 * what gets staked.
 *
 * Buying is one signature. The server builds a transaction that pays the
 * treasury and mints the ticket together, already signed by everyone except the
 * player; the wallet adds the last signature and sends it.
 *
 * But the signature is not the end of the purchase. The 0.05 SOL arrives
 * afterwards, from the server, and only once it can see the mint on chain — so
 * between the wallet returning and the player actually having what they paid for
 * there is a gap of several seconds, during which they hold an unconfirmed NFT
 * and an empty game wallet. `settle` is what closes that gap: it reads until the
 * ticket is really there, and it is what the buy dialog waits on before it
 * dares to close.
 */

export type Ticket =
  | { status: "disconnected" }
  /** Reading the chain. First paint after a connect. */
  | { status: "loading" }
  /** No ticket. The home screen offers to sell one. */
  | { status: "none"; priceSol: number }
  /** Bought. `lamports` is the *game wallet's* balance, not the player's own —
      which is the whole point of showing it. */
  | { status: "owned"; asset: string; gameWallet: string; lamports: bigint }
  | { status: "error"; message: string };

export function useTicket() {
  const { account } = useWalletUi();

  /* What the last read found, and *whose* it was.

     The owner is stored alongside it so that a result belonging to a wallet the
     player has since switched away from can be recognised and ignored. Without
     it, disconnecting and connecting a different wallet would show the previous
     one's ticket until the new read landed — which is not a stale spinner but a
     wrong answer, and the sort that ends with someone pressing START on a game
     wallet that is not theirs.

     `disconnected` and `loading` are both derived from this rather than written
     into it. Neither is something learned from the chain — one is the absence of
     a wallet, the other the absence of an answer yet — and writing them would
     mean an effect that sets state the moment it runs, which is exactly the
     cascading render `react-hooks/set-state-in-effect` exists to prevent. */
  const [loaded, setLoaded] = useState<{ owner: string; ticket: Ticket } | null>(
    null,
  );

  const owner = account?.address;

  const ticket: Ticket = !owner
    ? { status: "disconnected" }
    : loaded?.owner === owner
      ? loaded.ticket
      : { status: "loading" };

  /* The first read, on connect. Re-reading is not done by bumping this — it is
     done by calling `settle`, which does the fetch itself and writes what it
     finds. One way to ask, and one place the answer lands. */
  useEffect(() => {
    // No wallet, nothing to read — `ticket` already reports `disconnected` on
    // its own, so there is nothing to set here either.
    if (!owner) return;

    // The wallet this read is for. Captured rather than read back off `owner`,
    // so the result is tagged with the account that actually asked for it.
    const asked = owner;

    // Drops the response if the wallet changes while it is in flight, so a slow
    // read for the old account cannot overwrite a newer one.
    let cancelled = false;

    async function load() {
      const result = await read(asked);
      if (cancelled) return;
      setLoaded({ owner: asked, ticket: result });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [owner]);

  /**
   * Read until the ticket is really there, and hand back what was found.
   *
   * This is the second half of a purchase, and it is why it returns something.
   * The mint puts the NFT in the player's wallet, but the 0.05 SOL it pays for is
   * sent by the *server*, on the next status read — `settle` in `ticket.ts` sees
   * the asset on chain and funds the game wallet before it answers. So a buy is
   * not done when the wallet says so; it is done when a read comes back `owned`.
   * The dialog waits on this, and needs to be told which.
   *
   * Hence the retry. The wallet returns as soon as the mint is *sent*, and the
   * scan that looks for it (`getProgramAccounts`) will not see an unconfirmed
   * asset — so the first read after a buy can quite legitimately come back with
   * no ticket, and funding would never be triggered. Asking once and believing it
   * would strand a player who has already paid. So it asks again, and the answer
   * settles within a few seconds.
   *
   * It also writes what it finds, so a caller awaiting the result and the screen
   * watching the badge are never told two different things.
   */
  const settle = useCallback(async (): Promise<Ticket> => {
    if (!owner) return { status: "disconnected" };

    let result: Ticket = { status: "loading" };

    for (let attempt = 0; attempt < RETRIES; attempt++) {
      result = await read(owner);

      // Anything but a missing ticket is an answer: `owned` is the one being
      // waited for, and an `error` is worth reporting rather than papering over
      // with another eleven attempts.
      if (result.status !== "none") break;

      // Except on the last pass, where there is nothing left to wait for.
      if (attempt < RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }

    setLoaded({ owner, ticket: result });
    return result;
  }, [owner]);

  return { ticket, settle };
}

/* About fifteen seconds all told. The mint has to confirm and then be picked up
   by the account scan, which takes a couple of seconds on a good day; the rest is
   headroom for a bad one. Long enough that a slow devnet does not tell a paying
   player they have nothing, short enough that a genuinely failed mint does not
   leave them staring at a spinner. */
const RETRIES = 12;
const RETRY_MS = 1_250;

/** One read. Never throws: a failure is a `Ticket`, like any other answer. */
async function read(owner: string): Promise<Ticket> {
  try {
    const response = await fetch(`/api/ticket/status?owner=${owner}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as TicketStatusResponse & {
      error?: string;
    };

    if (!response.ok) throw new Error(body.error ?? "Could not read ticket.");

    return body.hasTicket && body.asset
      ? {
          status: "owned",
          asset: body.asset,
          gameWallet: body.gameWallet,
          lamports: BigInt(body.lamports),
        }
      : { status: "none", priceSol: body.priceSol };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Could not read ticket.",
    };
  }
}

/**
 * Buying.
 *
 * Takes the account rather than reading it, and that is not a style choice.
 * `useWalletUiSigner` dereferences the account it is handed — no account, no
 * `chains`, and it throws. It is also a hook, so it cannot be called
 * conditionally or lazily to dodge that.
 *
 * So the requirement moves into the type: this takes a `UiWalletAccount`, not a
 * `UiWalletAccount | undefined`, and the caller has to have one before it can
 * call. Whatever renders the buy button is responsible for not mounting until
 * there is a wallet — see `BuyTicketButton`. Written the other way, with the
 * account read here and asserted non-null, it renders fine in the browser and
 * then explodes during SSR, where there is no wallet at all.
 */
export function useBuyTicket(account: UiWalletAccount) {
  const signer = useWalletUiSigner({ account });

  return useCallback(async (): Promise<string> => {
    const response = await fetch("/api/ticket/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: account.address }),
    });
    const body = (await response.json()) as MintTicketResponse & {
      error?: string;
    };

    if (!response.ok) throw new Error(body.error ?? "Could not buy a ticket.");

    /* The server's transaction, back to bytes. It already carries the treasury's
       signature and the asset's; what it is missing is the player's, and that is
       the one the wallet is about to add.

       It is decoded rather than rebuilt, exactly as `jupiter.ts` decodes
       Jupiter's: rebuilding the message would throw away the signatures already
       on it, and they cannot be re-made in the browser — the treasury's key is
       on the server. */
    const wire = new Uint8Array(getBase64Encoder().encode(body.transaction));
    const transaction: Transaction = getTransactionDecoder().decode(wire);

    // Signs and sends in one go — this signer is the wallet, and wallets send
    // what they sign. The popup the player sees is this call.
    const [signature] = await signer.signAndSendTransactions([transaction]);

    return getBase58Decoder().decode(signature);
  }, [account, signer]);
}
