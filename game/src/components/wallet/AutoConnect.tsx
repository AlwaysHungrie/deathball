"use client";

import {
  getWalletFeature,
  useWalletUi,
  type UiWallet,
} from "@wallet-ui/react";
import { useEffect, useRef } from "react";
import { accountStorage } from "@/context/SolanaProvider";

/**
 * Reconnects the wallet the player used last, on load.
 *
 * wallet-ui already remembers *which* wallet, and already knows how to take it
 * back: connecting writes `name:address` to local storage, and on the next load
 * it looks that name up among the announced wallets and pulls the matching
 * account off it. What it never does is *ask*. It reads `wallet.accounts` as it
 * finds them, and a wallet sitting there with none matches nothing — so the
 * saved key resolves to nobody and the player is asked to connect again.
 *
 * Which is exactly what Phantom does. A Wallet Standard wallet may expose the
 * accounts a site is already trusted with as soon as it is announced — Backpack
 * and Solflare do, and for them wallet-ui's restore works untouched — or it may
 * expose none until the site calls `standard:connect`, which is Phantom. It is
 * wontfix upstream (create-solana-dapp#132), so the asking has to happen here.
 *
 * The ask is `silent`, so it is not the popup the player already agreed to once:
 * a wallet honouring the flag returns the accounts this site is authorized for
 * and prompts for nothing. An untrusted site — a first visit, or one the player
 * has revoked — gets nothing back, and they connect by hand, as they should. So
 * this can only restore a connection the player has already granted; it cannot
 * create one.
 *
 * And that is all it does. Once the accounts exist, wallet-ui's own restore
 * finds them — the announcement re-renders the wallet list, and the saved key
 * resolves against it. Nothing here hands the account over, deliberately: doing
 * so would be a *second* answer to "who is connected", and the setter latches,
 * permanently disabling the restore it was trying to help.
 */
export default function AutoConnect() {
  const { wallets, connected } = useWalletUi();

  // The saved key is `name:address`, so the name in front of the colon says who
  // to ask. It is not a claim that the site is still trusted — the wallet has
  // the only vote on that, and casts it by answering with accounts or with none.
  const savedName = accountStorage.get()?.split(":")[0];
  const wallet = wallets.find((w) => w.name === savedName);

  if (!wallet || connected) return null;

  return <Reconnect key={wallet.name} wallet={wallet} />;
}

/**
 * `getWalletFeature` throws on a wallet that cannot connect, and it is not a
 * hook, but the wallet it needs only turns up mid-render — hence the split. This
 * mounts only once there is a wallet worth asking.
 */
function Reconnect({ wallet }: { wallet: UiWallet }) {
  const asked = useRef(false);

  useEffect(() => {
    // Wallets are announced over the life of the page, not all at once, so the
    // list this hangs off can change more than once. The ask is worth making
    // once: a wallet that answered with nothing has said no, and asking it again
    // on the next announcement will not change its mind.
    if (asked.current) return;
    asked.current = true;

    /* Straight to the wallet's own `standard:connect` rather than through
       wallet-ui's `useWalletUiWallet`, whose input type omits `silent` — and
       `silent` is the whole point. Without it, this is the ordinary approval
       popup, fired unbidden on every page load, which is worse than the button
       it set out to save. */
    const { connect } = getWalletFeature(
      wallet,
      "standard:connect",
    ) as StandardConnectFeature;

    // Nothing to do with the result. A wallet that hands back accounts has
    // re-announced itself with them, and that is what wallet-ui's restore has
    // been waiting for; a wallet that hands back none, or throws, leaves the
    // player disconnected, which is the state the screen already knows how to
    // show. Either way there is nothing here worth reporting.
    connect({ silent: true }).catch(() => {});
  }, [wallet]);

  return null;
}

/** The one feature this needs, as much of it as it uses. */
type StandardConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<unknown>;
};
