"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 4000;

// While any Document is Queued or Extracting: nudge the queue and re-render
// the page so statuses update without a manual reload.
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const kick = () => fetch("/api/process", { method: "POST" }).catch(() => {});
    void kick();
    const timer = setInterval(() => {
      void kick();
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
