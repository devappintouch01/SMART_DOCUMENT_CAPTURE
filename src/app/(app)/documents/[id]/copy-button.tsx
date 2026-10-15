"use client";

import { useState } from "react";

type Props = {
  label: string;
  getText: () => string;
  // A small icon button for beside a value, instead of a labelled button.
  compact?: boolean;
  disabled?: boolean;
  title?: string;
};

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older or insecure contexts: fall back to a hidden textarea.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ label, getText, compact, disabled, title }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const ok = await writeToClipboard(getText());
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1500);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        title={label}
        className={`shrink-0 rounded px-1.5 py-1 text-xs ${
          state === "copied" ? "text-green-700" : state === "failed" ? "text-red-700" : "text-neutral-400 hover:text-primary"
        }`}
      >
        {state === "copied" ? "✓" : state === "failed" ? "✕" : "⧉"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled}
      title={title}
      className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {state === "copied" ? "คัดลอกแล้ว ✓" : state === "failed" ? "คัดลอกไม่สำเร็จ" : label}
    </button>
  );
}
