import { toBaht } from "@/domain/ai-usage";

// How the superadmin pages show money, time and tokens.

export function formatBaht(usd: number | null): string {
  if (usd === null) return "ไม่ทราบ";
  const baht = toBaht(usd);
  if (baht === 0) return "0 บาท";
  return baht < 0.01 ? "< 0.01 บาท" : `${baht.toFixed(2)} บาท`;
}

export function formatUsd(usd: number | null): string {
  return usd === null ? "ไม่ทราบ" : `$${usd.toFixed(usd < 0.01 ? 5 : 4)}`;
}

export function formatSeconds(ms: number | null): string {
  return ms === null ? "ไม่ทราบ" : `${(ms / 1000).toFixed(1)} วินาที`;
}

export function formatTokens(tokens: number | null): string {
  return tokens === null ? "ไม่ทราบ" : tokens.toLocaleString("en-US");
}

export const OPERATION_LABEL = {
  classify: "จัดประเภท",
  extract: "อ่านเอกสาร",
  propose: "เสนอประเภทใหม่",
} as const;

// th-TH is the Buddhist Era; the year is written out in full (2569).
export const dateTimeFormat = new Intl.DateTimeFormat("th-TH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});
