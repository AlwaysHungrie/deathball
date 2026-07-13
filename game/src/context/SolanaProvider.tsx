"use client";

import {
  createSolanaDevnet,
  createStorageAccount,
  createWalletUiConfig,
  WalletUi,
} from "@wallet-ui/react";
import type { ReactNode } from "react";
import AutoConnect from "@/components/wallet/AutoConnect";

const devnetUrl = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL;

/* Which wallet the player last connected, across reloads: `name:address`.
   wallet-ui makes one of these for itself if it is not handed one, and does all
   the writing to it — this is here only so that `AutoConnect` can *read* it, and
   read the same one wallet-ui is writing rather than a second copy that agrees
   with it only by luck. See `AutoConnect` for what it does with the answer. */
export const accountStorage = createStorageAccount();

// Devnet is the only cluster the game registers. Leaving the other clusters
// unregistered means there is nothing for wallet-ui to fall back to or switch
// into, so every RPC call the game makes is a devnet call. Omitting the url
// falls back to the public devnet endpoint. A wallet whose *extension* is
// pointed at mainnet is a separate problem — see the account check in
// wallet-status.
const config = createWalletUiConfig({
  accountStorage,
  clusters: [createSolanaDevnet(devnetUrl)],
});

export function SolanaProvider({ children }: { children: ReactNode }) {
  return (
    <WalletUi config={config}>
      {/* Inside the provider, because the wallets it asks are the ones the
          provider is announcing. It renders nothing. */}
      <AutoConnect />
      {children}
    </WalletUi>
  );
}
