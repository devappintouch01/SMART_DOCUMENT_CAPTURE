"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ExtractionStatus } from "@/domain/types";
import { Select } from "@/components/select";

const STATUS_LABELS: Record<ExtractionStatus, string> = {
  queued: "รอคิว",
  extracting: "กำลังอ่าน",
  done: "เสร็จ",
  failed: "ล้มเหลว",
};

const field =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-primary";

// Filters live in the URL, so a filtered list can be refreshed, bookmarked and
// shared, and the server renders exactly what the address says.
export function ListFilters({ documentTypes }: { documentTypes: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string>) {
    // Read the address bar, not the useSearchParams snapshot: right after a
    // replace() the snapshot can still hold the previous filters.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `/?${query}` : "/");
  }

  // Typing in the search box waits for a pause before filtering.
  useEffect(() => {
    if (search === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q: search.trim() }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const active = ["type", "status", "q"].some((key) => params.get(key));

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="ค้นหาชื่อไฟล์"
        aria-label="ค้นหาชื่อไฟล์"
        className={`${field} w-56`}
      />
      <Select
        value={params.get("type") ?? ""}
        onChange={(type) => update({ type })}
        ariaLabel="ประเภทเอกสาร"
        options={[{ value: "", label: "ทุกประเภท" }, ...documentTypes.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <Select
        value={params.get("status") ?? ""}
        onChange={(status) => update({ status })}
        ariaLabel="สถานะ"
        options={[
          { value: "", label: "ทุกสถานะ" },
          ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        ]}
      />
      {active && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            router.replace("/");
          }}
          className="text-sm text-neutral-500 hover:text-foreground"
        >
          ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
