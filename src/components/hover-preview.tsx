"use client";

import { useRef, useState, type ReactNode } from "react";

const WIDTH = 380;
const HEIGHT = 500;
const DELAY_MS = 350;

export type PreviewTarget = { url: string; mimeType: string; title: string };

type Shown = PreviewTarget & { x: number; y: number };

// The original file next to the pointer while it rests on a thumbnail. Follows
// the pointer, flips to its left near the right edge, and never takes the hover.
function PreviewBox({ url, mimeType, title, x, y }: Shown) {
  const left = x + 24 + WIDTH > window.innerWidth - 12 ? x - 24 - WIDTH : x + 24;
  const top = Math.min(Math.max(8, y - HEIGHT / 3), Math.max(8, window.innerHeight - HEIGHT - 8));
  return (
    <div
      aria-hidden="true"
      style={{ left, top, width: WIDTH, height: HEIGHT }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-black/15 bg-white shadow-2xl"
    >
      {mimeType === "application/pdf" ? (
        <iframe
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          title={`ตัวอย่าง ${title}`}
          className="h-full w-full"
          tabIndex={-1}
        />
      ) : (
        // A signed Storage URL or a local object URL, so next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

// Hover preview for thumbnails. Spread `handlers(target)` on the element that
// should open it and render `element` once anywhere in the component. It waits
// a moment, so passing over a thumbnail does not load the file.
export function useHoverPreview(): {
  handlers: (target: PreviewTarget | null) => {
    onMouseEnter: () => void;
    onMouseMove: (event: React.MouseEvent) => void;
    onMouseLeave: () => void;
  };
  element: ReactNode;
} {
  const [shown, setShown] = useState<Shown | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setShown(null);
  };

  return {
    handlers: (target) => ({
      onMouseEnter: () => {
        if (!target) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setShown({ ...target, ...pointer.current }), DELAY_MS);
      },
      onMouseMove: (event) => {
        pointer.current = { x: event.clientX, y: event.clientY };
        setShown((current) => (current ? { ...current, ...pointer.current } : current));
      },
      onMouseLeave: stop,
    }),
    element: shown ? <PreviewBox {...shown} /> : null,
  };
}
