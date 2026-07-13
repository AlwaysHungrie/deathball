"use client";

import { useEffect, useState } from "react";

/**
 * The wall clock, ticking once a second, or null before the first client paint.
 *
 * Null to begin with on purpose: the server and the browser do not agree on the
 * time, and rendering a countdown during SSR is a guaranteed hydration mismatch.
 * The first effect after mount is what sets the clock going.
 *
 * One clock, not one per readout. Anything that needs `now` shares this, and two
 * intervals would drift apart and re-render the same component twice a second
 * for no reason.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick(); // Don't wait a whole second to show the first value.

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}
