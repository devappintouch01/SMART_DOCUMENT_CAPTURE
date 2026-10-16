import type { Metadata } from "next";
import { EXTRACTION_MODELS } from "@/domain/ai-models";
import { TARGET_BAHT_PER_DOCUMENT, toBaht, USD_TO_THB } from "@/domain/ai-usage";
import { requireSuperAdmin } from "@/lib/session";
import { getDocumentService } from "@/server/container";
import { formatBaht, formatSeconds, formatUsd } from "../ai-format";
import { ModelPicker } from "./model-picker";

export const metadata: Metadata = { title: "แดชบอร์ด AI" };
export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  await requireSuperAdmin();
  const service = getDocumentService();
  const [report, choice] = await Promise.all([service.getAiUsageReport(), service.getExtractionModel()]);

  const average = report.averageCostPerDocumentUsd;
  const anyMeasured = report.models.some((m) => m.measuredCalls > 0);
  const withinTarget = average !== null && toBaht(average) <= TARGET_BAHT_PER_DOCUMENT;

  return (
    <section>
      <h1 className="text-2xl font-semibold">แดชบอร์ด AI</h1>
      <p className="mt-1 text-sm text-neutral-500">
        เห็นเฉพาะ superadmin · แปลงเป็นบาทที่ {USD_TO_THB} บาทต่อ 1 USD · นับเฉพาะการเรียกที่วัดต้นทุนได้
      </p>

      <div className="mt-6">
        <ModelPicker
          current={choice.model}
          source={choice.source}
          options={EXTRACTION_MODELS.map((m) => {
            const measured = report.models.find((row) => row.model === m.id)?.avgCostPerDocumentUsd ?? null;
            return {
              id: m.id,
              label: m.label,
              note: m.note,
              inputPerMTok: m.inputPerMTok,
              outputPerMTok: m.outputPerMTok,
              measuredBahtPerDocument: measured === null ? null : formatBaht(measured),
            };
          })}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-sm text-neutral-500">ต้นทุนเฉลี่ยต่อเอกสาร (ทุกโมเดล)</p>
          <p className={`mt-1 text-3xl font-semibold ${withinTarget ? "text-green-700" : ""}`}>
            {formatBaht(average)}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            เป้าหมายไม่เกิน {TARGET_BAHT_PER_DOCUMENT} บาท{" "}
            {average === null ? "· ยังไม่มีข้อมูลที่วัดได้" : withinTarget ? "· อยู่ในเป้า" : "· ยังเกินเป้า"}
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <p className="text-sm text-neutral-500">ต้นทุนรวมที่วัดได้</p>
          <p className="mt-1 text-3xl font-semibold">{formatBaht(anyMeasured ? report.totalCostUsd : null)}</p>
          <p className="mt-1 text-sm text-neutral-500">{formatUsd(anyMeasured ? report.totalCostUsd : null)}</p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-neutral-500">
            <tr className="border-b border-black/10">
              <th className="px-4 py-3 font-medium">AI / โมเดล</th>
              <th className="px-4 py-3 text-right font-medium">เรียก</th>
              <th className="px-4 py-3 text-right font-medium">ไม่สำเร็จ</th>
              <th className="px-4 py-3 text-right font-medium">เอกสาร</th>
              <th className="px-4 py-3 text-right font-medium">เฉลี่ยต่อเอกสาร</th>
              <th className="px-4 py-3 text-right font-medium">เวลาอ่านเฉลี่ย</th>
              <th className="px-4 py-3 text-right font-medium">ต้นทุนรวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {report.models.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  ยังไม่มีบันทึกการเรียก AI
                </td>
              </tr>
            )}
            {report.models.map((row) => (
              <tr key={`${row.provider}/${row.model}`}>
                <td className="px-4 py-3">
                  {row.provider} · {row.model}
                  {row.measuredCalls < row.calls && (
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {row.calls - row.measuredCalls} จาก {row.calls} ครั้งเป็นข้อมูลเก่า (ไม่ทราบ tokens, เวลา, ต้นทุน)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{row.calls}</td>
                <td className="px-4 py-3 text-right">{row.failedCalls}</td>
                <td className="px-4 py-3 text-right">{row.documents}</td>
                <td className="px-4 py-3 text-right">{formatBaht(row.avgCostPerDocumentUsd)}</td>
                <td className="px-4 py-3 text-right">{formatSeconds(row.avgExtractMs)}</td>
                <td className="px-4 py-3 text-right">{formatBaht(row.measuredCalls > 0 ? row.totalCostUsd : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
