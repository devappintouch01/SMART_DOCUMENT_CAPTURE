"use client";

import { useEffect, useState } from "react";

// First page of a PDF as a small picture. pdf.js is large, so it is loaded the
// first time a PDF shows up, and pictures are kept so a re-render (paging back,
// sorting) does not draw them again.
const pictures = new Map<string, string>();
let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  pdfjs ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return lib;
  });
  return pdfjs;
}

// Draw one at a time so a page full of PDFs does not stall the browser.
let queue: Promise<unknown> = Promise.resolve();

async function renderFirstPage(url: string, width: number): Promise<string> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ url });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    void task.destroy();
  }
}

function PdfBadge() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-md border border-black/10 bg-red-50 text-xs font-semibold text-red-700">
      PDF
    </span>
  );
}

// Shows the "PDF" badge while drawing, and keeps it if the file cannot be drawn.
export function PdfThumbnail({ url }: { url: string }) {
  const [picture, setPicture] = useState<string | null>(pictures.get(url) ?? null);

  useEffect(() => {
    if (pictures.has(url)) return;
    let cancelled = false;
    queue = queue
      .then(() => (cancelled ? null : renderFirstPage(url, 192)))
      .then((result) => {
        if (!result) return;
        pictures.set(url, result);
        if (!cancelled) setPicture(result);
      })
      .catch(() => {
        // Keep the badge: a thumbnail is a convenience.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const shown = picture ?? pictures.get(url) ?? null;
  if (!shown) return <PdfBadge />;
  // A drawn data URL, so next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={shown} alt="" className="h-12 w-12 rounded-md border border-black/10 bg-white object-cover object-top" />;
}
