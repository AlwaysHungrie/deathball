"use client";

import { useWalletUi } from "@wallet-ui/react";
import { useState } from "react";
import Dialog from "@/components/ui/Dialog";

/** Fires when the wallet extension itself is pointed somewhere other than devnet.
    The app only ever registers the devnet cluster, so a mainnet wallet does not
    change where the game reads from — it just means the balance shown is for an
    account the user cannot actually spend from here. */
export function WrongNetworkDialog() {
  const { account, connected } = useWalletUi();
  const [dismissed, setDismissed] = useState(false);

  // `chains` is what the wallet advertises for this account. A devnet account
  // lists `solana:devnet`; one on mainnet does not.
  const onDevnet = account?.chains.includes("solana:devnet") ?? true;
  const open = connected && !onDevnet && !dismissed;

  return (
    <Dialog
      open={open}
      onClose={() => setDismissed(true)}
      title="WRONG NETWORK"
    >
      <p className="text-center text-[9px] leading-relaxed text-neutral-400">
        Your wallet is set to mainnet. Deathball is played on devnet — switch the
        network in your wallet, then reconnect.
      </p>
    </Dialog>
  );
}
