import type { Match } from "@/lib/match";

/* The match on the pitch: who is playing, and when.
 *
 * Two halves of one row -- the fixture to the footballer's left, the clock
 * (`Kickoff`) to his right -- so the caller sits them either side of him as real
 * siblings and lets flexbox line all three up. They used to be absolutely
 * positioned against the strip, which meant the row's alignment was a pair of
 * hand-tuned offsets that drifted apart the moment either side changed height. */

/** Shared by both halves, so the fixture and the clock are the same lettering. */
export const PITCH_TYPE =
  "flex flex-col text-center text-sm leading-tight font-bold text-neutral-950 uppercase";

/** Left of the footballer: who is playing. */
export default function Fixture({ match }: { match: Match }) {
  return (
    <div className={PITCH_TYPE}>
      <div>{match.home}</div>
      <div className="text-neutral-950/50"> vs </div>
      <div>{match.away}</div>
    </div>
  );
}
