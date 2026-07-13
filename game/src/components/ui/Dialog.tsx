"use client";

import { Close } from "pixelarticons/react/Close";
import { useEffect, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Pixel-art modal. Lives inside the phone stage, not the viewport, so it darkens
    only the game and not the desk it sits on. */
export default function Dialog({ open, onClose, title, children }: DialogProps) {
  // Escape closes. Bound on the window rather than the panel so it fires without
  // the dialog having to hold focus.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
    >
      {/* Backdrop. A sibling of the panel rather than its parent, so a click
          landing on the panel never bubbles out here and closes the dialog. */}
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/80"
      />

      <div className="curtain-settle relative w-full border-4 border-neutral-100 bg-neutral-950">
        <div className="flex items-center justify-between border-b-4 border-neutral-100 px-4 py-3">
          <h2 className="text-[10px] text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="border-2 border-neutral-100/70 p-1 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px"
          >
            <Close width={14} height={14} aria-hidden />
          </button>
        </div>

        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
