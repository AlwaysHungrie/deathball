import { BALL_RADIUS, type Ball } from "./ball";
import { FIELD_LENGTH, LINE, MARGIN } from "./field";
import { Footballer } from "./footballer";
import { TEAMS, type Team } from "./sprites";

/** How many defenders stand between the player and the dirt. */
export const OPPONENT_COUNT = 11;

/** Opponents only close in sideways, and slower than the player runs. */
const CHASE_SPEED = 55;

/**
 * How far off the player's line a defender will tolerate before he bothers
 * shuffling across. Without it, `sign()` on a sub-pixel gap has him twitching
 * left and right forever, and he never stands still long enough to idle.
 */
const TRACKING_DEADBAND = 4;

/** How near the player has to get before a defender commits to the tackle. */
export const INFLUENCE_RADIUS = 78;

/**
 * The wider ring, where a defender notices the run and turns to meet it. Inside
 * this he chases the man on the full vector; only inside INFLUENCE_RADIUS does
 * he actually leave his feet.
 */
export const AWARENESS_RADIUS = 160;

/**
 * The band nearest the player's own goal is left empty — he needs a beat to get
 * running before the first defender is on him — and so is the strip of dirt.
 */
const FIRST_BAND = 1;

/** Sample points along the slide per second. Each one throws up a pair of scuffs. */
const MUD_RATE = 34;

/**
 * Where the turf gets torn, measured back along the tackle from the point the
 * body is anchored on. Two contacts, not one: the studs out in front, and the
 * hip and thigh he's lying on, a body-length behind them.
 */
const MUD_CONTACTS = [4, -34];

/** How far a scuff can stray to either side of the line he's ploughing. */
const MUD_SPREAD = 7;

/**
 * How far back along a streak the fade reaches. The scuff under the defender's
 * heels is freshest; by this many behind it, the turf has taken all it will.
 */
const MUD_FADE_TRAIL = 16;

/** What's left of a scuff once the fade has run its course. */
const MUD_FAINTEST = 0.12;

/** Opacity of the freshest scuff in a streak, right under the sliding boot. */
const MUD_FRESHEST = 0.4;

/**
 * How far ahead of the player the tackle is aimed, in seconds of his running.
 * A defender who lunges at where the player *is* always arrives behind him —
 * the player has run on by the time the boot lands. So he leads the target, and
 * the two arrive at the same patch of grass together.
 */
const TACKLE_LEAD = 0.42;

/** Speed the lead assumes the player is running at, since a defender can't read his mind. */
const ASSUMED_PLAYER_SPEED = 90;

/** How far a defender's aim can be off, in radians. Nobody times it perfectly. */
const AIM_ERROR = 0.12;

/**
 * How near a defender's boots have to get to the ball to hoof it clear. Wider
 * than the player's own touch: the player is trying to keep the thing, a
 * defender only has to get something on it.
 */
const CLEARANCE_RADIUS = BALL_RADIUS + 16;

/**
 * How near a sliding defender's body has to get to take the player down. Studs
 * first and stretched out, so he reaches further than his standing footprint —
 * this is the hitbox the player is actually jumping over.
 */
const TACKLE_RADIUS = 30;

export type Mud = {
  x: number;
  y: number;
  /** Chosen once at birth so the scuffs don't all sit at the same angle. */
  angle: number;
  scale: number;
  /**
   * How many scuffs this one's own streak has laid down behind it. It climbs as
   * the tackle grinds on, so the head of the streak is dark and the tail — dug
   * first, longest exposed — has faded back into the grass.
   */
  behind: number;
};

/** Opacity of one scuff, given how much of its streak came after it. */
export function mudAlpha(scuff: Mud): number {
  const fade = Math.min(1, scuff.behind / MUD_FADE_TRAIL);
  return MUD_FRESHEST - fade * (MUD_FRESHEST - MUD_FAINTEST);
}

export class Opponent {
  readonly body: Footballer;

  /** Set once the tackle is launched, so he only ever commits the once. */
  private committed = false;

  /** The line he threw himself down, in canvas radians. Only meaningful once committed. */
  private slideHeading = 0;

  /**
   * The heading he last walked on, as a raw vector — what he'd boot the ball
   * along if he ran into it on his feet. Footballer only keeps the compass
   * quarter it rounds to, which is enough to pick a walk cycle but too coarse to
   * clear a ball with.
   */
  private walkX = 0;
  private walkY = 0;

  /** This defender's own streak, oldest scuff first. Only he ever ages it. */
  private streak: Mud[] = [];

  /**
   * How badly this one reads the run, in radians. Drawn once at kickoff, not per
   * tackle: a defender is consistently a shade early or a shade late, and the
   * player can't dodge a coin flip.
   */
  private readonly aimError = (Math.random() - 0.5) * 2 * AIM_ERROR;

  constructor(x: number, y: number, team: Team) {
    this.body = new Footballer({ team, x, y, speed: CHASE_SPEED });
  }

  get x() {
    return this.body.x;
  }
  get y() {
    return this.body.y;
  }
  get sliding() {
    return this.body.sliding;
  }

  /** True once he's thrown himself and the slide has run out. He never gets up. */
  get spent() {
    return this.committed && !this.body.sliding;
  }

  /**
   * Does he get a boot on the ball? He hoofs it clear along the line he was
   * travelling — a walking clearance goes where he was walking, a sliding one
   * where the studs were pointed. Nobody on this team is trying to keep it.
   *
   * Only ever a ball sitting still: one already in motion has been hit and is
   * nobody's until it stops. The ball enforces that itself, so there's no
   * priority to settle between his boot and the player's.
   */
  private clearBall(ball: Ball) {
    if (!ball.kickable) return;
    if (!ball.within(this.body, CLEARANCE_RADIUS)) return;

    // Where the boot is going. A slide has the line it was thrown down; a
    // defender on his feet gets whatever heading he happens to be running. A man
    // standing dead still has neither, so he thumps it away from himself.
    let angle: number;
    if (this.body.sliding) {
      angle = this.slideHeading;
    } else {
      const speed = Math.hypot(this.walkX, this.walkY);
      angle =
        speed > 0
          ? Math.atan2(this.walkY, this.walkX)
          : Math.atan2(ball.y - this.body.y, ball.x - this.body.x);
    }

    ball.clear(angle, this.body.sliding);
  }

  /**
   * Does his slide take the player down?
   *
   * Only a slide, and only a player on the ground. A defender on his feet can
   * run straight through him — irritating, not fatal — and a player in the air is
   * over the top of the tackle, which is the whole reason to jump one.
   */
  private catches(player: Footballer) {
    if (!this.body.sliding) return false;
    if (player.airborne) return false;
    return (
      Math.hypot(player.x - this.body.x, player.y - this.body.y) <= TACKLE_RADIUS
    );
  }

  /**
   * @param dt     seconds since the last update
   * @param mud    collects the scuffs this opponent grinds out; they outlive him
   * @param ball   hoofed clear if he gets a boot on it
   * @returns true if his slide caught the player — which ends the run
   */
  update(dt: number, player: Footballer, mud: Mud[], ball: Ball): boolean {
    if (this.spent) {
      // The tackle was the last thing he had. Killing him leaves him face-down
      // exactly where he slid to, still along the line he threw himself down —
      // and a dead body neither moves nor animates. Left alive he'd stand there
      // running an idle loop on the spot.
      //
      // He's out of the game from here: he can't catch the player and he can't
      // touch the ball. Bodies on the turf are scenery.
      if (this.body.state === "alive") this.body.kill();
      this.body.update(dt);
      return false;
    }

    const playerX = player.x;
    const playerY = player.y;

    if (!this.committed) {
      const gap = playerX - this.body.x;
      const drop = playerY - this.body.y;
      const range = Math.hypot(gap, drop);

      if (range <= INFLUENCE_RADIUS) {
        // He throws himself at where the player is *going*, not where he stands.
        // The player runs up the pitch (-y) the whole time he's in the air, so a
        // tackle aimed at the man himself lands in the grass behind him.
        const leadY = playerY - ASSUMED_PLAYER_SPEED * TACKLE_LEAD;
        let angle = Math.atan2(leadY - this.body.y, playerX - this.body.x);

        // Nobody's timing is perfect. The nudge is his own, fixed at kickoff, so
        // it reads as this defender being a shade off rather than as noise.
        angle += this.aimError;

        this.body.move(Math.cos(angle), Math.sin(angle));
        this.body.slide(angle);
        this.slideHeading = angle;
        this.committed = true;
      } else if (range <= AWARENESS_RADIUS) {
        // He's seen him coming. Now he breaks off the line and runs at the man
        // himself — down the pitch to meet him as well as across it — so the
        // player can't simply outrun a defender who only ever moves sideways.
        this.body.move(gap, drop);
        this.walkX = gap;
        this.walkY = drop;
      } else if (Math.abs(gap) > TRACKING_DEADBAND) {
        // Still just holding his zone. Purely sideways: the player supplies all
        // the vertical, so a defender who hasn't spotted him yet only has to
        // cover the width.
        this.body.move(Math.sign(gap), 0);
        this.walkX = Math.sign(gap);
        this.walkY = 0;
      } else {
        // Squared up with him already. Standing still is a real state, not a gap
        // between steps — without the deadband a defender a fraction of a pixel
        // off would shuffle back and forth forever and never once stand up
        // straight to breathe.
        this.body.move(0, 0);
        this.walkX = 0;
        this.walkY = 0;
      }
    }

    const wasSliding = this.body.sliding;
    const fromX = this.body.x;
    const fromY = this.body.y;

    this.body.update(dt);

    // Both tested where he ended up, not where he started: a defender at full
    // stretch covers most of a body-length in a frame, and checking the old
    // position would have the player and the ball pass clean through the slide he
    // just threw.
    this.clearBall(ball);
    const caught = this.catches(player);

    // Mud is laid down after the move, along the ground he actually covered.
    // Stamping per-frame would clump wherever the framerate dipped, so the
    // count comes off dt and the scuffs are spread across the step.
    if (wasSliding) {
      const count = Math.max(1, Math.round(MUD_RATE * dt));

      // A pair of scuffs per sample — boots and body both tear the turf — so the
      // streak ages twice as fast as the samples come.
      const laid = count * MUD_CONTACTS.length;

      // Every scuff already in this streak now has `laid` more behind it, so the
      // whole tail dims a notch each time he digs up fresh turf.
      for (const scuff of this.streak) scuff.behind += laid;

      // Scuffs lie along the drag, give or take — a boot ploughing turf throws
      // it roughly the way it's travelling, not in every direction at once.
      const drag = Math.atan2(this.body.y - fromY, this.body.x - fromX);

      // He's stretched out along the line he threw himself down, so the ground
      // he actually touches runs from the studs back to the hip. The anchor is
      // only his feet; without this the whole streak squirts out of one point.
      const alongX = Math.cos(this.slideHeading);
      const alongY = Math.sin(this.slideHeading);
      // The perpendicular, for scattering scuffs either side of his line.
      const acrossX = -alongY;
      const acrossY = alongX;

      let behind = laid - 1;
      for (let i = 0; i < count; i++) {
        // Where the body was at this point within the step. Sampling across the
        // step rather than once per frame keeps the streak even when the
        // framerate dips.
        const t = (i + 1) / count;
        const atX = fromX + (this.body.x - fromX) * t;
        const atY = fromY + (this.body.y - fromY) * t;

        for (const contact of MUD_CONTACTS) {
          const drift = (Math.random() - 0.5) * 2 * MUD_SPREAD;
          const scuff: Mud = {
            x: atX + alongX * contact + acrossX * drift,
            y: atY + alongY * contact + acrossY * drift,
            angle: drag + (Math.random() - 0.5) * 0.9,
            scale: 0.75 + Math.random() * 0.4,
            // Later scuffs within this one step are fresher than earlier ones.
            behind: behind--,
          };
          // Same objects in both lists: the canvas draws off `mud`, the streak is
          // just this defender's handle on the ones he's allowed to age.
          this.streak.push(scuff);
          mud.push(scuff);
        }
      }
    }

    return caught;
  }
}

/**
 * Ten defenders, one per even band of pitch, alternating sides — a zig-zag the
 * player has to weave through rather than a wall he can run round.
 */
export function spawnOpponents(width: number, playerTeam: Team): Opponent[] {
  // One side, one kit. They're a team, not eleven strangers — and it means the
  // player can read "not my colours" as "about to take me out" at a glance.
  // Anyone but his own side, so a defender never reads as a team-mate.
  const kits = TEAMS.filter((team) => team !== playerTeam);
  const opposition = kits[Math.floor(Math.random() * kits.length)];

  const left = MARGIN + LINE;
  const right = width - MARGIN - LINE;
  const inner = right - left;

  // Bands run from the dirt back toward the player's own goal. Leaving the
  // first one empty gives him room to start; the rest carve up what's left.
  const bands = OPPONENT_COUNT + FIRST_BAND;
  const band = FIELD_LENGTH / bands;

  const opponents: Opponent[] = [];
  for (let i = 0; i < OPPONENT_COUNT; i++) {
    // Band 0 is the dirt end, so count down from the far end of the pitch.
    const y = FIELD_LENGTH - (i + FIRST_BAND + 0.5) * band;

    // The zig-zag: quarter-width in from one touchline, then the other, with a
    // little jitter so the pattern doesn't read as a machine-stamped slalom.
    const side = i % 2 === 0 ? 0.25 : 0.75;
    const jitter = (Math.random() - 0.5) * inner * 0.12;
    const x = Math.min(right, Math.max(left, left + inner * side + jitter));

    opponents.push(new Opponent(x, y, opposition));
  }
  return opponents;
}
