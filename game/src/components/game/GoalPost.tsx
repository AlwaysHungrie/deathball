"use client";

import { useEffect, useRef } from "react";

const FRAME_W = 168;
const FRAME_H = 90;
const FRAMES = 4;
const FPS = 6;

/** Goal post with a looping 4-frame net ripple. */
export default function GoalPost({ scale = 2 }: { scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let sheet: HTMLImageElement | null = null;
    let cancelled = false;
    let raf = 0;
    let frame = 0;
    let elapsed = 0;

    const img = new Image();
    img.onload = () => {
      if (!cancelled) sheet = img;
    };
    img.src = "/sprites/goal.png";

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      elapsed += dt;
      const step = 1 / FPS;
      while (elapsed >= step) {
        elapsed -= step;
        frame = (frame + 1) % FRAMES;
      }

      ctx.clearRect(0, 0, FRAME_W, FRAME_H);
      ctx.imageSmoothingEnabled = false;
      if (sheet) {
        ctx.drawImage(
          sheet,
          frame * FRAME_W,
          0,
          FRAME_W,
          FRAME_H,
          0,
          0,
          FRAME_W,
          FRAME_H,
        );
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={FRAME_W}
      height={FRAME_H}
      style={{ width: FRAME_W * scale, height: FRAME_H * scale }}
    />
  );
}
