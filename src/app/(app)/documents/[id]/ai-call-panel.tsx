import type { AiCall } from "@/domain/ai-usage";
import {
  dateTimeFormat,
  formatBaht,
  formatSeconds,
  formatTokens,
  formatUsd,
  OPERATION_LABEL,
} from "../../ai-format";

type Props = {
  calls: AiCall[];
  uploadedAt: Date;
  completedAt: Date | null;
};

// Superadmin only: which model read this Document, how long it took and what
// it cost. The page must not render this for anyone else.
export function AiCallPanel({ calls, uploadedAt, completedAt }: Props) {
  const total = completedAt ? completedAt.getTime() - uploadedAt.getTime() : null;
  const cost = calls.some((c) => c.costUsd !== null)
    ? calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0)
    : null;

  return (
    <section className="mt-8 rounded-xl border border-black/10 bg-white p-5" aria-label="ข้อมูลการเรียก AI">
      <h2 className="text-base font-semibold">การเรียก AI (เฉพาะ superadmin)</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">ตั้งแต่กดส่งจนเสร็จ (รวมรอคิว)</dt>
          <dd className="font-medium">{formatSeconds(total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">ต้นทุนรวมของใบนี้</dt>
          <dd className="font-medium">
            {formatBaht(cost)} ({formatUsd(cost)})
          </dd>
        </div>
      </dl>

      {calls.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">ไม่มีบันทึกการเรียก AI ของเอกสารนี้</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-neutral-500">
              <tr className="border-b border-black/10">
                <th className="py-2 pr-4 font-medium">งาน</th>
                <th className="py-2 pr-4 font-medium">AI / โมเดล</th>
                <th className="py-2 pr-4 font-medium">เริ่มเรียก</th>
                <th className="py-2 pr-4 text-right font-medium">เวลาตอบ</th>
                <th className="py-2 pr-4 text-right font-medium">tokens เข้า/ออก</th>
                <th className="py-2 text-right font-medium">ต้นทุน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {calls.map((call) => (
                <tr key={call.id} className="align-top">
                  <td className="py-2 pr-4">
                    {OPERATION_LABEL[call.operation]}
                    {call.status === "error" && (
                      <span className="mt-0.5 block text-red-700">ไม่สำเร็จ: {call.error}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {call.provider} · {call.model}
                    {call.isLegacy && (
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        ข้อมูลเก่า: โมเดลสันนิษฐานจากการตั้งค่าตอนนั้น
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{dateTimeFormat.format(call.startedAt)}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">{formatSeconds(call.durationMs)}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">
                    {formatTokens(call.inputTokens)} / {formatTokens(call.outputTokens)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{formatBaht(call.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
