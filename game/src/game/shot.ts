import { Ball } from "./ball";
import { DIRT_DEPTH, FIELD_LENGTH, MARGIN } from "./field";

/**
 * The shot: the one moment the player isn't running.
 *
 * It runs in two beats. First everything stops dead and holds — long enough to
 * land as a decision rather than a stutter. Then the ball leaves his boot and
 * bends away up the pitch on a curve of its own, and the camera goes with it.
 *
 * The whole thing is on rails. Nothing collides with it, nothing can take it, and
 * it always ends the same way: the ball comes to rest out on the dirt, which the
 * game already knows how to read as the end of the run.
 */

/** How long the world holds its breath before he hits it. */
const HOLD = 0.75;

/**
 * How fast the ball travels, in world px/sec.
 *
 * The flight is timed off this rather than the other way round. A fixed duration
 * would mean a struck ball crosses whatever ground lies in front of it in the same
 * number of seconds — so a shot from the halfway line would tear away and one from
 * the edge of the box would trundle. The ball is hit the same however far out he
 * is; what changes is how long it's in the air.
 */
const SPEED = 800;

/** ...but no shot is over before it registers, however close in he takes it. */
const MIN_FLIGHT = 0.5;

/**
 * How much of the flight the camera takes to come off the run's framing and onto
 * the ball's, as a fraction of it. It has to be a move rather than a cut — the run
 * frames the player low and the shot frames the ball centred, so switching between
 * them in one frame is a visible lurch.
 */
const HANDOVER = 0.5;

/**
 * How far into the dirt the ball is aimed, as a fraction of the dirt's depth.
 *
 * Not the seam itself and not the back of it: a target on the seam barely reads as
 * having left the pitch, and one at the very back is off the screen by the time the
 * camera has settled. This is the band in between — the patch he's aiming at when
 * he shoots from close in.
 */
const TARGET_NEAR = 0.25;
const TARGET_FAR = 0.75;

/**
 * Inside this much of the field, measured from the goal, he can pick his spot: the
 * ball is aimed at the real dirt and it lands there.
 */
const RANGE = 0.3;

/**
 * How much bigger the patch he's aiming at gets by the time he's shooting from his
 * own goal line — the far end of the pitch, and the worst shot in the game.
 *
 * The patch is *scaled about the goal line*, which doesn't move, so it grows out
 * sideways past the touchlines and back past the dirt, but never towards him. That
 * is what makes a long shot bad: the goal stays the size it always was while the
 * ground he might hit instead grows around it, so the odds of finding the mouth
 * fall away the further out he takes it on. Nothing about this is drawn — the patch
 * is only ever somewhere to aim.
 */
const WILD = 6;

/**
 * Where the curve's control point sits along the line from boot to target.
 *
 * The whole character of the shot is in this number. At 0.5 the ball bends evenly
 * and reads as a lazy arc; pushed up near the target it flies straight for most of
 * its life and then breaks late, which is the shot we want. Randomised inside a
 * narrow band so no two are quite the same.
 */
const BEND_AT_NEAR = 0.6;
const BEND_AT_FAR = 0.8;

/**
 * How far the control point is thrown off the straight line, as a fraction of the
 * shot's length. Signed, so it bends left as often as right.
 */
const BEND_NEAR = 0.06;
const BEND_FAR = 0.16;

type Point = { x: number; y: number };

export class Shot {
  /** Seconds elapsed since he called for it. */
  private t = 0;

  private readonly from: Point;
  private readonly control: Point;
  private readonly to: Point;

  /** Arc length of the curve, so the ball can be walked along it at a fixed pace. */
  private readonly length: number;

  /** How long this particular shot is in the air: its length, flown at SPEED. */
  private readonly flight: number;

  /** The camera as the run left it — where this one has to start from. */
  private readonly from0: number;

  /**
   * How far the camera has been handed over from the run's framing to the ball's,
   * 0 to 1. Tied to the ball's own progress, so the view is still while the ball
   * is still and moves only because the ball does.
   */
  private handover = 0;

  /** Whether the ball has crossed the goal line, and gone in, on its way out. */
  scored = false;

  /** Whether the ball has arrived. The run ends the moment it has. */
  done = false;

  constructor(ball: Ball, width: number, camera: number) {
    this.from0 = camera;
    this.from = { x: ball.x, y: ball.y };

    // Somewhere on the patch he's aiming at — the real dirt if he's close enough
    // in, and a blown-up version of it if he isn't. Picked in the real patch first,
    // then pushed outwards by however wild the shot is.
    const x = MARGIN + Math.random() * (width - 2 * MARGIN);
    const y =
      -DIRT_DEPTH * (TARGET_NEAR + Math.random() * (TARGET_FAR - TARGET_NEAR));

    // The patch is scaled about the goal line, so the seam at y=0 and the mouth
    // sitting on it are the one thing that doesn't move. Everything else — the
    // touchlines, the back of the dirt — is pushed away from it, so the ground he
    // might hit instead of the goal grows while the goal itself stays put.
    const spread = this.spread(ball.y);
    this.to = {
      x: width / 2 + (x - width / 2) * spread,
      y: y * spread,
    };

    const dx = this.to.x - this.from.x;
    const dy = this.to.y - this.from.y;
    const span = Math.hypot(dx, dy);

    // The control point: slide along the straight line towards the target, then
    // push out sideways from it. Sitting it late is what makes the ball hold its
    // line and then break away at the end.
    const along = BEND_AT_NEAR + Math.random() * (BEND_AT_FAR - BEND_AT_NEAR);
    const bend =
      (BEND_NEAR + Math.random() * (BEND_FAR - BEND_NEAR)) *
      span *
      (Math.random() < 0.5 ? -1 : 1);

    // Unit normal to the shot's line — which way "sideways" is.
    const nx = span === 0 ? 1 : -dy / span;
    const ny = span === 0 ? 0 : dx / span;

    this.control = {
      x: this.from.x + dx * along + nx * bend,
      y: this.from.y + dy * along + ny * bend,
    };

    this.length = arcLength(this.from, this.control, this.to);
    this.flight = Math.max(this.length / SPEED, MIN_FLIGHT);
  }

  /**
   * How far the patch he's aiming at is blown up, given where he shot from.
   *
   * 1 anywhere inside RANGE of the goal — there the patch is the real dirt, and a
   * shot lands on it. Beyond that it opens out, all the way to WILD back on his own
   * goal line. Squared on the way out so the fall-off is gentle just past the edge
   * of his range and vicious from distance, rather than punishing him evenly for
   * every pixel he isn't close.
   *
   * @param from the world y he struck it from
   */
  private spread(from: number) {
    // Distance from the goal line, as a fraction of the whole pitch.
    const out = Math.max(0, Math.min(from / FIELD_LENGTH, 1));
    if (out <= RANGE) return 1;

    const past = (out - RANGE) / (1 - RANGE);
    return 1 + (WILD - 1) * past * past;
  }

  /**
   * Advance the shot and put the ball where it now is.
   *
   * @param dt seconds since the last update
   * @param inMouth did the ball cross the goal line between the posts?
   */
  update(dt: number, ball: Ball, inMouth: (x: number) => boolean) {
    this.t += dt;

    // The hold. Nothing moves; the ball sits exactly where his boot found it.
    if (this.t < HOLD) return;

    const flown = Math.min((this.t - HOLD) / this.flight, 1);

    // Take the camera over during the first part of the flight, and smoothly, so
    // it eases off the run's framing instead of starting to slide the instant the
    // ball moves. Done well before the ball lands: a view still drifting as it
    // arrives would pull focus from the thing it's meant to be showing.
    this.handover = smooth(Math.min(flown / HANDOVER, 1));

    // Constant speed along the curve, not constant in the curve's own parameter —
    // a bezier walked at an even `t` speeds up and slows down as its control point
    // pulls it about, and a struck ball doesn't.
    const point = atDistance(
      this.from,
      this.control,
      this.to,
      flown * this.length,
    );

    const wasBehindLine = ball.y > 0;
    // Through `moveTo`, so it tumbles the ground it covers instead of skating up
    // the pitch without turning over.
    ball.moveTo(point.x, point.y);

    // The same crossing test the run itself makes, made here because the run
    // isn't the thing moving the ball any more.
    if (wasBehindLine && ball.y <= 0 && inMouth(ball.x)) this.scored = true;

    if (flown >= 1) this.done = true;
  }

  /**
   * Where the camera should sit while the shot plays out.
   *
   * It ends up following the ball rather than the player, who isn't going
   * anywhere — but it can't simply switch to doing that, because the run frames
   * the player low on the screen and this frames the ball in the middle of it. Cut
   * straight from one to the other and the view lurches on the frame he calls for
   * the shot, before the ball has even been struck.
   *
   * So it starts from exactly the camera the run handed over and is drawn across
   * to the ball only as the ball actually travels: no motion during the hold, and
   * none of it uncommanded. Same clamp as the run, so it comes to rest pinned on
   * the dirt — right where a run that got there would have left it.
   */
  camera(ball: Ball, height: number, clamp: (y: number) => number) {
    const follow = ball.y - height / 2;
    return clamp(this.from0 + (follow - this.from0) * this.handover);
  }
}

/** Ease in and out of a 0..1 ramp, so a move off it starts and stops gently. */
function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** A point on the quadratic bezier through `from` → `control` → `to`. */
function at(from: Point, control: Point, to: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

/**
 * How many straight segments the curve is chopped into when it's measured and
 * walked. A quadratic bezier has no closed form for arc length, so both are done
 * by flattening it. Fine enough that the seams don't show at this scale.
 */
const STEPS = 48;

function arcLength(from: Point, control: Point, to: Point) {
  let total = 0;
  let previous = from;
  for (let i = 1; i <= STEPS; i++) {
    const point = at(from, control, to, i / STEPS);
    total += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return total;
}

/**
 * The point `distance` along the curve, measured as arc length rather than as the
 * bezier's own parameter. Walks the flattened curve until it has spent the
 * distance, then lands proportionally inside whichever segment it ran out on.
 */
function atDistance(from: Point, control: Point, to: Point, distance: number) {
  let spent = 0;
  let previous = from;

  for (let i = 1; i <= STEPS; i++) {
    const point = at(from, control, to, i / STEPS);
    const step = Math.hypot(point.x - previous.x, point.y - previous.y);

    if (spent + step >= distance) {
      const into = step === 0 ? 0 : (distance - spent) / step;
      return {
        x: previous.x + (point.x - previous.x) * into,
        y: previous.y + (point.y - previous.y) * into,
      };
    }

    spent += step;
    previous = point;
  }

  return to;
}
