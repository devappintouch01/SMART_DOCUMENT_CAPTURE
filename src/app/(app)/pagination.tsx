"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/select";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "@/domain/paging";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  // "10" | "50" | "100" | "all"
  size: string;
  offset: number;
  shown: number;
};

// Page numbers to show: the first, the last, and a window around the current
// one, with "…" for the gaps.
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) result.push("gap");
    result.push(p);
  });
  return result;
}

// Page and page size live in the URL, like the filters.
export function Pagination({ page, pageCount, total, size, offset, shown }: Props) {
  const router = useRouter();

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.push(query ? `/?${query}` : "/");
  }

  const button =
    "min-w-9 rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-neutral-500">แสดง</span>
        <Select
          value={size}
          onChange={(next) => go({ size: next === DEFAULT_PAGE_SIZE ? null : next, page: null })}
          options={PAGE_SIZES}
          ariaLabel="จำนวนรายการต่อหน้า"
          size="sm"
        />
        <span className="text-neutral-500">
          {total === 0 ? "ไม่มีรายการ" : `รายการที่ ${offset + 1}–${offset + shown} จาก ${total}`}
        </span>
      </div>

      {pageCount > 1 && (
        <nav aria-label="หน้า" className="flex items-center gap-1">
          <button
            type="button"
            className={`${button} border-black/15 bg-white hover:bg-neutral-50`}
            disabled={page <= 1}
            onClick={() => go({ page: page - 1 === 1 ? null : String(page - 1) })}
          >
            ก่อนหน้า
          </button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-neutral-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? "page" : undefined}
                className={`${button} ${
                  p === page
                    ? "border-primary bg-primary text-white"
                    : "border-black/15 bg-white hover:bg-neutral-50"
                }`}
                onClick={() => go({ page: p === 1 ? null : String(p) })}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${button} border-black/15 bg-white hover:bg-neutral-50`}
            disabled={page >= pageCount}
            onClick={() => go({ page: String(page + 1) })}
          >
            ถัดไป
          </button>
        </nav>
      )}
    </div>
  );
}
