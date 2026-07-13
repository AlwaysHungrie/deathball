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
 * player; the wallet adds the last signature and sends it. The 0.05 SOL arrives
 * afterwards, from the server, once it can see the mint on chain — which is why
 * `buy` re-reads the status when it is done rather than assuming what it will
 * say.
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

  /* Bumped to re-read. Going through state rather than calling the fetch
     directly keeps every setTicket behind an await, which is what the
     set-state-in-effect rule wants to see.

     It is also how a purchase reports itself: the mint lands in the player's
     wallet, but the SOL it pays for is sent by the server on the next read, so
     `refresh` is not a courtesy here — it is the second half of the buy. */
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

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
      try {
        const response = await fetch(`/api/ticket/status?owner=${asked}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as TicketStatusResponse & {
          error?: string;
        };
        if (cancelled) return;

        if (!response.ok) throw new Error(body.error ?? "Could not read ticket.");

        setLoaded({
          owner: asked,
          ticket:
            body.hasTicket && body.asset
              ? {
                  status: "owned",
                  asset: body.asset,
                  gameWallet: body.gameWallet,
                  lamports: BigInt(body.lamports),
                }
              : { status: "none", priceSol: body.priceSol },
        });
      } catch (error) {
        if (cancelled) return;
        setLoaded({
          owner: asked,
          ticket: {
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not read ticket.",
          },
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [owner, nonce]);

  return { ticket, refresh };
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
