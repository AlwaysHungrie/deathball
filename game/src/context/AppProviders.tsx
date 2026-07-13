import type { ReactNode } from "react";
import { ReplayProvider } from "./ReplayProvider";
import { SolanaProvider } from "./SolanaProvider";
import { TradeProvider } from "./TradeProvider";

/**
 * Everything the whole app is mounted under, in one place.
 *
 * The order is not arbitrary and the nesting is the point:
 *
 * `SolanaProvider` is outermost because both of the others sit inside an app
 * that has a wallet — nothing below it works without one.
 *
 * `ReplayProvider` and `TradeProvider` are here rather than inside a route
 * because what they hold has to survive a navigation. The replay is picked on
 * the start screen and played on the pitch; the position is opened on the start
 * screen and sold on the pitch. Those are two pages, and a provider mounted
 * inside either one would be torn down on the way to the other. Up here, Next
 * re-renders the pages underneath without remounting these, so the odds and the
 * ticket make the trip.
 *
 * `MusicProvider` is deliberately *not* here: the music is the start screen's,
 * and it mounts there. Hoisting it would have the theme playing over the pitch.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <ReplayProvider>
        <TradeProvider>{children}</TradeProvider>
      </ReplayProvider>
    </SolanaProvider>
  );
}
