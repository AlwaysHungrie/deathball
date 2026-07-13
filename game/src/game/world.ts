import { Ball, LEAD } from "./ball";
import { cameraAt, clampCamera } from "./camera";
import { inGoalMouth, laneOf, MARGIN, START_Y } from "./field";
import { Footballer } from "./footballer";
import { spawnOpponents, type Mud, type Opponent } from "./opponent";
import { Shot } from "./shot";
import type { Team } from "./sprites";
import type { GameState } from "./state";

/**
 * The run, as a thing that can be stepped.
 *
 * Everything that used to live in the canvas component's one enormous effect —
 * the entities, the rules that end a run, the shot — is here, and none of it
 * touches React or a drawing context. The component builds one of these, steps it
 * once a frame, and hands it to the renderer.
 *
 * That separation is the point: the rules of a run are now readable without
 * scrolling past sprite loading and `requestAnimationFrame` bookkeeping, and they
 * can be stepped without a canvas to draw into.
 */

const RUN_SPEED = 90;

export class World {
  /** CSS pixels. Kept in sync with the canvas by `resize`. */
  width: number;
  height: number;

  readonly team: Team;

  player: Footballer;
  opponents: Opponent[];
  ball: Ball;

  /** Scuffs are permanent for the run: nothing ever removes one, so the pitch
      carries the record of every tackle by the time he reaches the dirt. */
  mud: Mud[] = [];

  /** Where a tap has sent him sideways. While this is set he runs across the
      pitch instead of up it; cleared the moment he arrives. */
  private strafeTarget: number | null = null;

  /** The shot, once he has called for it. Built on the frame he does, because it
      is struck from wherever the ball happens to be sitting at that moment. */
  shot: Shot | null = null;

  /** Whether the ball went in on its way out. Latched: it is decided the frame it
      crosses the line, and nothing after that can take it back. */
  scored = false;

  /** Whether this run's ending has already been handed to the page. */
  private reported = false;

  constructor(width: number, height: number, team: Team) {
    this.width = width;
    this.height = height;
    this.team = team;

    this.player = new Footballer({ team, x: width / 2, y: START_Y });
    this.opponents = spawnOpponents(width, team);
    // Spotted a stride ahead of him, so the very first thing he does is run onto
    // it. Same offset a dribble re-establishes, so kickoff looks like any other
    // touch.
    this.ball = new Ball(this.player.x, this.player.y - LEAD);
  }

  /** Rewind for a fresh run. */
  reset() {
    // He is the one thing here that survives a run, so a tackle that killed him
    // has to be undone by hand — everything else below is built fresh.
    this.player.revive();
    this.player.y = START_Y;
    this.player.x = this.width / 2;
    this.strafeTarget = null;
    this.opponents = spawnOpponents(this.width, this.team);
    this.ball = new Ball(this.player.x, this.player.y - LEAD);
    this.mud = [];
    this.reported = false;
    this.scored = false;
    this.shot = null;
  }

  /** The stage changed size. */
  resize(width: number, height: number) {
    const previous = this.width;
    this.width = width;
    this.height = height;

    this.player.x = width / 2;
    // The lanes just moved under him, so any target he was crossing to is void.
    this.strafeTarget = null;

    // Everything already on the pitch is stretched to the new width rather than
    // respawned — a mid-run resize shouldn't wipe the tackles he's already dodged
    // or the mud they left.
    if (previous > 0 && previous !== width) {
      const ratio = width / previous;
      for (const opponent of this.opponents) opponent.body.x *= ratio;
      for (const scuff of this.mud) scuff.x *= ratio;
      this.ball.x *= ratio;
    }
  }

  /** A tap in one of the flanking lanes sends him across to it. Tapping the lane
      he is already in is a no-op, so he cannot be nudged off his line by the first
      half of a double-tap. */
  strafeTo(tapX: number) {
    if (laneOf(tapX, this.width) === laneOf(this.player.x, this.width)) return;
    this.strafeTarget = Math.min(
      this.width - MARGIN,
      Math.max(MARGIN, tapX),
    );
  }

  jump() {
    this.player.jump();
  }

  /** Where the camera sits this frame.
   *
   * Once he has shot, the camera goes with the ball rather than the player, who is
   * standing still and is no longer what the moment is about. It stays with the
   * ball after the shot lands, too — handing the camera back to a player still
   * stranded down the pitch would snap the view off the ball just as the curtain
   * comes down on it. Same clamps either way, so it settles pinned on the dirt
   * exactly where a run that got there would have left it. */
  get camera(): number {
    return this.shot
      ? this.shot.camera(this.ball, this.height, (y) =>
          clampCamera(y, this.height),
        )
      : cameraAt(this.player.y, this.height);
  }

  /**
   * Advance the world one frame.
   *
   * @returns `true` on the frame the run ends, and only that frame — latched, so
   *   the caller is told exactly once. Read `scored` to know how it ended.
   */
  step(dt: number, state: GameState): boolean {
    if (state === "playing") return this.play(dt);
    if (state === "shooting") return this.strike(dt);
    // Only `playing` and `shooting` advance the world. The other states still
    // draw, so the frozen pitch shows through the curtain behind the buttons.
    return false;
  }

  private play(dt: number): boolean {
    const { player, ball } = this;
    player.speed = RUN_SPEED;

    if (this.strafeTarget === null) {
      // Auto-run: with nothing pulling him sideways, intent is "up the field".
      player.move(0, -1);
    } else {
      // Crossing to a tapped lane. He gives up all forward motion until he gets
      // there, then picks the run back up on the next frame.
      const gap = this.strafeTarget - player.x;
      // One frame's travel. Anything closer than that would overshoot and leave
      // him juddering either side of the target forever.
      if (Math.abs(gap) <= player.speed * dt) {
        player.x = this.strafeTarget;
        this.strafeTarget = null;
        player.move(0, -1);
      } else {
        player.move(Math.sign(gap), 0);
      }
    }

    player.update(dt);

    // After the player, so a touch is judged against where his boots actually
    // ended up this frame — and before the defenders, so a ball he has just lifted
    // overhead is already out of their reach when they swing.
    const wasBehindLine = ball.y > 0;
    ball.update(dt, player);

    // The moment it crosses the far goal line, ask where it crossed. Judged on the
    // frame it happens rather than on where it finally comes to rest, because a
    // ball that goes in keeps rolling into the dirt behind the net and could end
    // up anywhere back there.
    if (wasBehindLine && ball.y <= 0 && inGoalMouth(ball.x, this.width)) {
      this.scored = true;
    }

    // A slide that catches him ends it. Checked across every defender rather than
    // short-circuiting, so they all still move, tackle and churn up mud on the
    // frame the run ends — bailing early would freeze the pitch mid-tackle.
    let tackled = false;
    for (const opponent of this.opponents) {
      if (opponent.update(dt, player, this.mud, ball)) tackled = true;
    }
    if (tackled && player.state === "alive") player.kill();

    // Four ways the run ends. He gets to the dirt; a slide takes him down; or he
    // loses the ball for good — off the side, out behind him, or dead on the dirt
    // at the far end. He only ever runs forward, so none of those balls are coming
    // back.
    if (player.y <= 0) player.y = 0;
    const over =
      player.y <= 0 ||
      tackled ||
      ball.offPitch(cameraAt(player.y, this.height), this.width, this.height) ||
      ball.deadOnDirt();

    return this.report(over);
  }

  private strike(dt: number): boolean {
    const { player, ball } = this;

    // He has called for the shot. The world is stopped — nobody runs, nobody
    // tackles — and the only thing that moves is the ball, once it has been hit.
    // Struck from wherever it was sitting when he called for it, and handed the
    // camera as the run left it, so the view does not jump on the way in.
    this.shot ??= new Shot(ball, this.width, cameraAt(player.y, this.height));

    // The ball is on rails now: not free, so nothing can kick it or take it, and
    // the roll it had is spent.
    ball.state = "attached";
    ball.vx = 0;
    ball.vy = 0;

    this.shot.update(dt, ball, (x) => inGoalMouth(x, this.width));
    if (this.shot.scored) this.scored = true;

    if (this.shot.done) {
      // Hand it back the way the run would have left it — free, stopped, out on
      // the dirt — so the end is read by the same rule as any other ball that dies
      // up there, rather than by a second one bolted on here.
      ball.state = "free";
      return this.report(true);
    }

    return false;
  }

  /**
   * Latched, because the end condition stays true once it is true: the ball that
   * is gone stays gone, and he stays standing on the dirt. Without this it fires
   * every frame until the state change lands back here a render later. The page
   * owns what happens next, so this just says that it happened.
   */
  private report(over: boolean): boolean {
    if (!over || this.reported) return false;
    this.reported = true;
    return true;
  }
}
