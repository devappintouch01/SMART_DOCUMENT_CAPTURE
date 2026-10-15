"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { CorrectionInput, FlagTarget } from "@/domain/corrections";
import type { ExtractedData, ExtractedValue } from "@/domain/extracted-data";
import { formatDateBE, parseThaiDate } from "@/domain/format";
import { copyValue, headerTsv, lineItemsTsv } from "@/domain/tabular";
import type { Field } from "@/domain/types";
import { confirmReviewFlags, saveCorrections } from "./actions";
import { CopyButton } from "./copy-button";

type Props = {
  documentId: string;
  headerFields: Field[];
  lineFields: Field[];
  data: ExtractedData;
  // The original file, shown beside the form.
  viewer: ReactNode;
  // Re-read panel and status messages, shown above the form.
  notices: ReactNode;
};

type Row = { sourceIndex: number | null; key: string; values: Record<string, string> };

// How a stored value appears in an input the user can type into.
function toInput(field: Field, value: string | null): string {
  if (value === null) return "";
  return field.kind === "date" ? formatDateBE(value) : value;
}

// Back to what the server expects; a bad date is reported before sending.
function toStored(field: Field, text: string): { value: string; problem: string | null } {
  if (field.kind !== "date" || text.trim() === "") return { value: text, problem: null };
  const iso = parseThaiDate(text);
  return iso
    ? { value: iso, problem: null }
    : { value: text, problem: `${field.name}: ใส่วันที่เป็น วว/ดด/ปปปป (พ.ศ.) เช่น 15/10/2569` };
}

// Line Item columns get room by what they hold: long text needs the most, short
// text and dates a medium amount, numbers and money the least.
function columnWidth(kind: Field["kind"]): string {
  switch (kind) {
    case "long_text":
      return "min-w-[22rem]";
    case "text":
      return "min-w-44";
    case "date":
      return "min-w-36";
    default:
      // Numbers and money stay narrow so the text columns take the rest.
      return "w-36 min-w-28";
  }
}

const inputBase =
  "w-full rounded-md border bg-white px-2 py-1 text-sm outline-none focus:border-primary";

// Looks like the one-line input for short text and grows to show everything
// when the text is long or has line breaks.
function AutoTextarea({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className={`${className} resize-none overflow-hidden leading-snug`}
    />
  );
}

function Cell({
  field,
  value,
  entry,
  onChange,
  onConfirm,
  busy,
}: {
  field: Field;
  value: string;
  entry: ExtractedValue | undefined;
  onChange: (text: string) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const flagged = entry?.flag?.status === "open";
  const numeric = field.kind === "amount" || field.kind === "number";
  const className = `${inputBase} ${numeric ? "text-right tabular-nums" : ""} ${
    flagged ? "border-amber-400 bg-amber-50" : "border-black/15"
  } ${entry?.corrected ? "font-medium text-blue-800" : ""}`;
  return (
    <div>
      <div className="flex items-start gap-1.5">
      {field.kind === "long_text" ? (
        // A long-text Field (chosen when the Document Type was set up) can run
        // over several lines, so it gets a box that grows with its content.
        <AutoTextarea value={value} onChange={onChange} label={field.name} className={className} />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={numeric ? "decimal" : undefined}
          placeholder={field.kind === "date" ? "วว/ดด/ปปปป" : undefined}
          aria-label={field.name}
          className={className}
        />
      )}
      <CopyButton
        label={`คัดลอก ${field.name}`}
        compact
        getText={() => {
          const iso = field.kind === "date" ? parseThaiDate(value) : null;
          return field.kind === "date" ? copyValue("date", iso) || value : value.trim();
        }}
      />
      </div>
      {flagged && (
        <p className="mt-0.5 flex items-center gap-2 text-xs text-amber-800">
          <span>⚠ {entry?.flag?.reason}</span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded border border-amber-300 px-1.5 py-0.5 hover:bg-amber-100 disabled:opacity-50"
          >
            ถูกต้อง
          </button>
        </p>
      )}
    </div>
  );
}

// Header Fields as a form and Line Items as an editable table (spec: result
// detail). Saving stores every changed value as a Correction.
export function ResultEditor({ documentId, headerFields, lineFields, data, viewer, notices }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialHeader = useMemo(
    () => Object.fromEntries(headerFields.map((f) => [f.id, toInput(f, data.header[f.id]?.value ?? null)])),
    [headerFields, data],
  );
  const initialRows = useMemo<Row[]>(
    () =>
      data.lineItems.map((row, index) => ({
        sourceIndex: index,
        key: `src-${index}`,
        values: Object.fromEntries(lineFields.map((f) => [f.id, toInput(f, row[f.id]?.value ?? null)])),
      })),
    [lineFields, data],
  );

  const [header, setHeader] = useState(initialHeader);
  const [rows, setRows] = useState(initialRows);

  const dirty = JSON.stringify([header, rows]) !== JSON.stringify([initialHeader, initialRows]);
  const openFlags: FlagTarget[] = [
    ...headerFields
      .filter((f) => data.header[f.id]?.flag?.status === "open")
      .map((f) => ({ rowIndex: null, fieldId: f.id })),
    ...data.lineItems.flatMap((row, rowIndex) =>
      lineFields.filter((f) => row[f.id]?.flag?.status === "open").map((f) => ({ rowIndex, fieldId: f.id })),
    ),
  ];

  function run(action: () => Promise<{ error: string | null }>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
      if (!result.error) router.refresh();
    });
  }

  function save() {
    const problems: string[] = [];
    const convert = (fields: Field[], values: Record<string, string>) =>
      Object.fromEntries(
        fields.map((field) => {
          const { value, problem } = toStored(field, values[field.id] ?? "");
          if (problem) problems.push(problem);
          return [field.id, value];
        }),
      );
    const input: CorrectionInput = {
      header: convert(headerFields, header),
      lineItems: rows.map((row) => ({ sourceIndex: row.sourceIndex, values: convert(lineFields, row.values) })),
    };
    if (problems.length > 0) {
      setError([...new Set(problems)].join("\n"));
      return;
    }
    run(() => saveCorrections(documentId, input));
  }

  const confirmOne = (target: FlagTarget) => run(() => confirmReviewFlags(documentId, [target]));

  return (
    <div className="space-y-6">
      {/* Top: the original beside the form. The Line Items table follows below
          at full width, because it has too many columns for half a page. */}
      <div className="grid gap-6 lg:grid-cols-2">
      {viewer}
      <div className="min-w-0 space-y-6">
      {notices}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm shadow-sm">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-primary px-4 py-1.5 font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setHeader(initialHeader);
              setRows(initialRows);
              setError(null);
            }}
            disabled={pending}
            className="text-neutral-500 hover:text-foreground"
          >
            ยกเลิกการแก้ไข
          </button>
        )}
        <span className={dirty ? "text-amber-700" : "text-neutral-500"}>
          {dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : "ค่าที่แก้ไขแล้วแสดงเป็นสีน้ำเงิน"}
        </span>
        <CopyButton
          label="คัดลอกข้อมูลหลัก"
          disabled={dirty}
          title={dirty ? "บันทึกการแก้ไขก่อน" : "วางลง Excel ได้ทันที"}
          getText={() => headerTsv([...headerFields, ...lineFields], data)}
        />
        {lineFields.length > 0 && (
          <CopyButton
            label="คัดลอกรายการ"
            disabled={dirty}
            title={dirty ? "บันทึกการแก้ไขก่อน" : "วางลง Excel ได้ทันที"}
            getText={() => lineItemsTsv([...headerFields, ...lineFields], data)}
          />
        )}
        <a
          href={dirty ? undefined : `/api/documents/${documentId}/export`}
          aria-disabled={dirty}
          title={dirty ? "บันทึกการแก้ไขก่อน" : undefined}
          className={`rounded-md border border-green-600 px-3 py-1.5 font-medium text-green-800 ${
            dirty ? "pointer-events-none opacity-50" : "hover:bg-green-50"
          }`}
        >
          ดาวน์โหลด Excel
        </a>
        {openFlags.length > 0 && (
          <button
            type="button"
            onClick={() => run(() => confirmReviewFlags(documentId, openFlags))}
            disabled={pending || dirty}
            title={dirty ? "บันทึกการแก้ไขก่อน" : undefined}
            className="ml-auto rounded-md border border-amber-300 px-3 py-1.5 text-amber-900 hover:bg-amber-50 disabled:opacity-50"
          >
            ยืนยันทั้ง {openFlags.length} ช่องที่ควรตรวจ
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-black/10 bg-white">
        <h2 className="border-b border-black/10 px-4 py-3 font-medium">ข้อมูลหลัก</h2>
        <div className="divide-y divide-black/5">
          {headerFields.map((field) => (
            <div key={field.id} className="grid grid-cols-5 items-start gap-3 px-4 py-2 text-sm">
              <label className="col-span-2 pt-1 text-neutral-500">{field.name}</label>
              <div className="col-span-3">
                <Cell
                  field={field}
                  value={header[field.id] ?? ""}
                  entry={data.header[field.id]}
                  busy={pending || dirty}
                  onChange={(text) => setHeader((current) => ({ ...current, [field.id]: text }))}
                  onConfirm={() => confirmOne({ rowIndex: null, fieldId: field.id })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      </div>
      </div>

      {lineFields.length > 0 && (
        <div className="rounded-xl border border-black/10 bg-white">
          <h2 className="border-b border-black/10 px-4 py-3 font-medium">รายการ ({rows.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  {lineFields.map((field) => (
                    <th key={field.id} className="px-2 py-2 font-normal whitespace-nowrap">
                      {field.name}
                    </th>
                  ))}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((row) => (
                  <tr key={row.key} className="align-top">
                    {lineFields.map((field) => (
                      <td key={field.id} className={`${columnWidth(field.kind)} px-2 py-2`}>
                        <Cell
                          field={field}
                          value={row.values[field.id] ?? ""}
                          entry={row.sourceIndex === null ? undefined : data.lineItems[row.sourceIndex]?.[field.id]}
                          busy={pending || dirty}
                          onChange={(text) =>
                            setRows((current) =>
                              current.map((r) =>
                                r.key === row.key ? { ...r, values: { ...r.values, [field.id]: text } } : r,
                              ),
                            )
                          }
                          onConfirm={() =>
                            row.sourceIndex !== null && confirmOne({ rowIndex: row.sourceIndex, fieldId: field.id })
                          }
                        />
                      </td>
                    ))}
                    <td className="px-1 py-2 text-center">
                      <button
                        type="button"
                        aria-label="ลบแถวนี้"
                        onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                        className="text-neutral-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black/10 px-4 py-2">
            <button
              type="button"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    sourceIndex: null,
                    key: `new-${crypto.randomUUID()}`,
                    values: Object.fromEntries(lineFields.map((f) => [f.id, ""])),
                  },
                ])
              }
              className="text-sm text-primary hover:underline"
            >
              + เพิ่มแถว
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
