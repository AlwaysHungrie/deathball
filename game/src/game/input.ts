/**
 * The two gestures the pitch understands, turned into intents.
 *
 * A single tap in a flanking lane sends him across to it; two taps in quick
 * succession hop him over a tackle. Both are read off `pointerdown` and timed by
 * hand rather than listening for `dblclick`, which touch browsers fire late or not
 * at all.
 */

/** Two taps inside this window count as a double-tap. */
const DOUBLE_TAP_MS = 280;

export type TapHandlers = {
  /** Double-tap. */
  onJump: () => void;
  /** Single tap, at `x` CSS pixels from the canvas's left edge. */
  onStrafe: (x: number) => void;
  /** Whether the pitch is live. Taps on a frozen world do nothing. */
  isPlaying: () => boolean;
};

/** Wire the gestures onto a canvas. Returns the teardown. */
export function bindTaps(
  canvas: HTMLCanvasElement,
  { onJump, onStrafe, isPlaying }: TapHandlers,
): () => void {
  let lastTap = 0;

  const onPointerDown = (event: PointerEvent) => {
    const now = performance.now();

    if (now - lastTap < DOUBLE_TAP_MS && isPlaying()) {
      onJump();
      // Consumed, so a third tap starts a fresh pair instead of re-triggering.
      lastTap = 0;
      return;
    }
    lastTap = now;

    if (!isPlaying()) return;

    const rect = canvas.getBoundingClientRect();
    onStrafe(event.clientX - rect.left);
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  return () => canvas.removeEventListener("pointerdown", onPointerDown);
}
