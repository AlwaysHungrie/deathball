import { DIRT_DEPTH, FIELD_LENGTH } from "./field";

/** Where the player sits while the ground does the moving, as a fraction of screen height. */
export const ANCHOR = 0.78;

/**
 * How far the camera is allowed to go: never past the far end of the dirt, and
 * never back past the bottom of the pitch.
 *
 * Pulled out on its own because the shot has to obey the same limits while
 * following something other than the player — and it is the near clamp that pins
 * the camera on the dirt at the end of a run.
 */
export function clampCamera(y: number, height: number): number {
  return Math.min(Math.max(y, -DIRT_DEPTH), FIELD_LENGTH - height);
}

/**
 * The world y sitting at the top of the screen, given where the player is.
 *
 * The camera trails him by the anchor offset, but stops once the dirt is fully on
 * screen. Past that the camera is pinned and he walks up the screen under his own
 * steam.
 */
export function cameraAt(playerY: number, height: number): number {
  return clampCamera(playerY - height * ANCHOR, height);
}
