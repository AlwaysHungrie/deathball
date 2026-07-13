"use client";

import { useEffect, useRef } from "react";
import { Footballer } from "@/game/footballer";
import { loadTeamSheet, type Team } from "@/game/sprites";

const WIDTH = 120;
const HEIGHT = 100;
const SCALE = 4;

/** The footballer idling at the bottom of the start screen. Drops into the death
    animation when `dead` flips — the reel picking a replay kills him. */
export default function IdlePlayer({
  team = "sanlorenzo",
  dead = false,
}: {
  team?: Team;
  dead?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Footballer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const player = new Footballer({
      team,
      x: WIDTH / 2,
      y: HEIGHT,
      scale: SCALE,
    });
    playerRef.current = player;

    let sheet: HTMLImageElement | null = null;
    let cancelled = false;
    let frame = 0;

    void loadTeamSheet(team).then((img) => {
      if (!cancelled) sheet = img;
    });

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      player.update(dt);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.imageSmoothingEnabled = false;
      if (sheet) player.draw(ctx, sheet);

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      playerRef.current = null;
    };
  }, [team]);

  // The render loop is already running; killing the model is enough to switch it
  // over to the death animation on the next frame.
  useEffect(() => {
    if (dead) playerRef.current?.kill();
  }, [dead]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      className="h-[100px] w-[120px]"
    />
  );
}
