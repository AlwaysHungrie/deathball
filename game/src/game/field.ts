/** How much pitch there is to run, in world pixels, before the dirt. */
export const FIELD_LENGTH = 3000;

/** Depth of the brown band capping the far end of the field. */
export const DIRT_DEPTH = 240;

/** World y=0 is the dirt/grass seam; the player runs from FIELD_LENGTH up to 0. */
export const GRASS = "#2f7a3f";
export const GRASS_DARK = "#286b36";
export const DIRT = "#6b4a2b";
export const DIRT_DARK = "#5a3d23";
export const CHALK = "#e8ede9";

/** Every marking is this thick, so the pitch reads as one hand-painted set. */
export const LINE = 4;

/** Touchlines are inset from the screen edge; the strip outside is run-off grass. */
export const MARGIN = 5;

const CENTRE_CIRCLE_R = 70;
const BOX_WIDTH = 330;
const BOX_DEPTH = 175;
/**
 * Also the width of the goal mouth: the goal sprite is drawn straddling the far
 * six-yard box, so its posts land on this box's uprights. Anything that decides
 * whether a ball went *in* measures against this, not against the sprite.
 */
export const SIX_YARD_WIDTH = 220;
const SIX_YARD_DEPTH = 90;
const CORNER_R = 14;

/** How far the penalty spot sits off its goal line. */
const PENALTY_SPOT = 135;

/**
 * Radius of the arc struck around the penalty spot. It only reads as a "D" if
 * it reaches past the box edge, so it has to clear the gap between spot and
 * edge — this is that gap plus the depth of the bulge that pokes out.
 */
const ARC_R = BOX_DEPTH - PENALTY_SPOT + 55;

/**
 * The player kicks off standing on his own penalty spot — the near goal line is
 * at FIELD_LENGTH - LINE, and the spot is PENALTY_SPOT in from it.
 */
export const START_Y = FIELD_LENGTH - LINE - PENALTY_SPOT;

/** The pitch is read as five lanes. They're invisible — nothing is painted for them. */
export const LANES = 5;

/**
 * Which lane an x falls in, 0 (left) to LANES-1 (right). Anything outside the
 * touchlines clamps to the nearest lane rather than falling off the end.
 */
export function laneOf(x: number, width: number): number {
  const left = MARGIN;
  const inner = width - 2 * MARGIN;
  const lane = Math.floor(((x - left) / inner) * LANES);
  return Math.min(LANES - 1, Math.max(0, lane));
}

/**
 * Is `x` between the posts?
 *
 * The mouth is the six-yard box's width, centred like it is. Used to tell a ball
 * that crossed the far goal line inside the frame — a goal — from one that went
 * over it anywhere else, which is just a ball lost in the dirt.
 */
export function inGoalMouth(x: number, width: number): boolean {
  const half = SIX_YARD_WIDTH / 2;
  const midX = width / 2;
  return x >= midX - half && x <= midX + half;
}

export type Tuft = {
  x: number;
  y: number;
  w: number;
  h: number;
  dark: boolean;
};

/**
 * Deterministic scatter, generated once for the whole field. Tufts live in world
 * space so they scroll with the ground instead of swimming against it.
 */
export function makeTufts(width: number, count = 260): Tuft[] {
  // Fixed seed: the pitch should look the same every run.
  let seed = 0x9e3779b9;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const tufts: Tuft[] = [];
  for (let i = 0; i < count; i++) {
    tufts.push({
      x: random() * width,
      y: random() * FIELD_LENGTH,
      w: 2 + Math.floor(random() * 3) * 2,
      h: 2 + Math.floor(random() * 2) * 2,
      dark: random() < 0.5,
    });
  }
  return tufts;
}

/**
 * Paints the pitch markings for one frame.
 *
 * Everything is expressed in world y and shifted by the camera, so the lines
 * scroll with the ground. The player runs from y=FIELD_LENGTH (his own goal
 * line) up to y=0 (the far goal line, where the dirt starts), so the far end
 * gets the box he's attacking and the near end gets the one he came out of.
 */
export function drawMarkings(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: number,
) {
  const left = MARGIN;
  const right = width - MARGIN;
  const inner = right - left;
  const midX = width / 2;

  // A line only costs anything if it's on screen; camera-cull each one.
  const visible = (y: number, pad = 0) =>
    y - camera > -pad - LINE && y - camera < height + pad;

  const hLine = (y: number, x0 = left, x1 = right) => {
    if (!visible(y)) return;
    ctx.fillRect(Math.round(x0), Math.round(y - camera), Math.round(x1 - x0), LINE);
  };

  const vLine = (x: number, y0: number, y1: number) => {
    if (y1 - camera < 0 || y0 - camera > height) return;
    ctx.fillRect(Math.round(x), Math.round(y0 - camera), LINE, Math.round(y1 - y0));
  };

  // Stroked shapes (circles, arcs) share the fill colour, so set both once.
  ctx.fillStyle = CHALK;
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = LINE;

  // Touchlines: full length of the pitch, down both sides.
  vLine(left, 0, FIELD_LENGTH);
  vLine(right - LINE, 0, FIELD_LENGTH);

  // Goal lines at both ends.
  hLine(0);
  hLine(FIELD_LENGTH - LINE);

  // Halfway line, centre circle, centre spot.
  const half = FIELD_LENGTH / 2;
  hLine(half);
  if (visible(half, CENTRE_CIRCLE_R + LINE)) {
    ctx.beginPath();
    ctx.arc(midX, half - camera, CENTRE_CIRCLE_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(midX - LINE / 2, half - camera - LINE / 2, LINE, LINE);
  }

  // Penalty area + goal area at each end. `dir` points from the goal line into
  // the pitch, so the same box maths serves both ends.
  const box = (goalLine: number, dir: 1 | -1) => {
    const boxW = Math.min(BOX_WIDTH, inner - 2 * LINE);
    const boxX0 = midX - boxW / 2;
    const boxX1 = midX + boxW / 2;
    const boxEdge = goalLine + dir * BOX_DEPTH;

    hLine(boxEdge, boxX0, boxX1);
    vLine(boxX0, Math.min(goalLine, boxEdge), Math.max(goalLine, boxEdge));
    vLine(boxX1 - LINE, Math.min(goalLine, boxEdge), Math.max(goalLine, boxEdge));

    // Six-yard box, nested inside.
    const sixW = Math.min(SIX_YARD_WIDTH, boxW - 2 * LINE);
    const sixX0 = midX - sixW / 2;
    const sixX1 = midX + sixW / 2;
    const sixEdge = goalLine + dir * SIX_YARD_DEPTH;

    hLine(sixEdge, sixX0, sixX1);
    vLine(sixX0, Math.min(goalLine, sixEdge), Math.max(goalLine, sixEdge));
    vLine(sixX1 - LINE, Math.min(goalLine, sixEdge), Math.max(goalLine, sixEdge));

    // Penalty spot.
    const spot = goalLine + dir * PENALTY_SPOT;
    if (visible(spot)) {
      ctx.fillRect(midX - LINE / 2, spot - camera - LINE / 2, LINE, LINE);
    }

    // The D: the slice of the penalty arc that pokes out past the box edge.
    if (visible(spot, ARC_R + LINE)) {
      // Angle from the spot to where the arc crosses the box edge. Outside that
      // wedge the arc would be drawn inside the box, where it doesn't belong.
      const cut = Math.acos(Math.min(1, (BOX_DEPTH - PENALTY_SPOT) / ARC_R));
      ctx.beginPath();
      // Canvas angles run clockwise from +x. dir === 1 means the pitch lies at
      // increasing y (near end), so the D opens downward, and vice versa.
      const centre = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      ctx.arc(midX, spot - camera, ARC_R, centre - cut, centre + cut);
      ctx.stroke();
    }
  };

  box(0, 1);
  box(FIELD_LENGTH - LINE, -1);

  // Corner arcs, one per corner.
  const corner = (x: number, y: number, start: number) => {
    if (!visible(y, CORNER_R + LINE)) return;
    ctx.beginPath();
    ctx.arc(x, y - camera, CORNER_R, start, start + Math.PI / 2);
    ctx.stroke();
  };
  corner(left, 0, 0);
  corner(right, 0, Math.PI / 2);
  corner(right, FIELD_LENGTH, Math.PI);
  corner(left, FIELD_LENGTH, -Math.PI / 2);
}

