// Renders the fake demo documents (scripts/demo-fixtures-data.mjs) to PDF/PNG
// with headless Chrome and writes fixtures/demo/manifest.json.
// Usage: npm run fixtures:build   (needs Google Chrome installed)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { FIXTURES } from "./demo-fixtures-data.mjs";

const CHROME =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!CHROME) throw new Error("Chrome not found; set CHROME_PATH");

const OUT = new URL("../fixtures/demo/", import.meta.url);
const TMP = new URL("../.fixture-tmp/", import.meta.url);
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const FIELD_ORDER = {
  ใบกำกับภาษี: ["รหัสสินค้า", "รายการ", "จำนวน", "หน่วย", "ราคาต่อหน่วย", "จำนวนเงิน"],
  ใบเสร็จรับเงิน: ["รายการ", "จำนวน", "ราคาต่อหน่วย", "จำนวนเงิน"],
  ใบเบิกสินค้า: ["รหัสสินค้า", "รายการ", "จำนวนที่เบิก", "หน่วย"],
};
const NUMERIC = new Set(["จำนวน", "ราคาต่อหน่วย", "จำนวนเงิน", "จำนวนที่เบิก"]);
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const val = (x) => (typeof x === "object" && x !== null ? x.v : x);
const isHand = (x) => typeof x === "object" && x !== null && x.hand === true;
const text = (x) => (isHand(x) ? `<span class="hand">${esc(val(x))}</span>` : esc(val(x)));
const thaiDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
};
const money = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (field, x) => (NUMERIC.has(field) && !isHand(x) && field !== "จำนวน" && field !== "จำนวนที่เบิก" ? money(val(x)) : text(x));

function html(f) {
  const h = f.header;
  const cols = FIELD_ORDER[f.documentType];
  const isReq = f.documentType === "ใบเบิกสินค้า";
  const isReceipt = f.documentType === "ใบเสร็จรับเงิน";

  const parties = isReq
    ? `<div class="box">ผู้ขอเบิก: <b>${text(h.ผู้ขอเบิก)}</b><br>แผนก: <b>${esc(h.แผนก)}</b><br>ผู้อนุมัติ: <b>${text(h.ผู้อนุมัติ)}</b></div>`
    : `<div class="box"><b>${esc(h.ชื่อผู้ขาย)}</b>${h.สาขาผู้ขาย ? ` (${esc(h.สาขาผู้ขาย)})` : ""}<br>เลขประจำตัวผู้เสียภาษี ${esc(h.เลขประจำตัวผู้เสียภาษีผู้ขาย)}</div>`;
  const no = h.เลขที่ใบกำกับภาษี ?? h.เลขที่ใบเสร็จ ?? h.เลขที่ใบเบิก;
  const date = h.วันที่ ?? h.วันที่เบิก;
  const buyer = isReq
    ? ""
    : `<div class="box">${isReceipt ? "ได้รับเงินจาก" : "ลูกค้า"}: <b>${esc(h.ชื่อผู้ซื้อ)}</b>${h.สาขาผู้ซื้อ ? ` ${esc(h.สาขาผู้ซื้อ)}` : ""}${h.เลขประจำตัวผู้เสียภาษีผู้ซื้อ ? `<br>เลขประจำตัวผู้เสียภาษี ${esc(h.เลขประจำตัวผู้เสียภาษีผู้ซื้อ)}` : ""}${isReceipt ? `<br>ชำระโดย: ${esc(h.วิธีชำระเงิน)}` : ""}</div>`;

  const head = cols.map((c) => `<th>${c}</th>`).join("");
  const rows = f.lineItems
    .map((row) => `<tr>${cols.map((c) => `<td class="${NUMERIC.has(c) ? "num" : ""}">${cell(c, row[c])}</td>`).join("")}</tr>`)
    .join("");

  let totals = "";
  if (f.documentType === "ใบกำกับภาษี") {
    totals = `<table class="totals"><tr><td>รวมเงิน</td><td class="num">${money(h.มูลค่าก่อนภาษี)}</td></tr><tr><td>ภาษีมูลค่าเพิ่ม 7%</td><td class="num">${money(h.ภาษีมูลค่าเพิ่ม)}</td></tr><tr><td><b>รวมทั้งสิ้น</b></td><td class="num"><b>${isHand(h.ยอดรวมทั้งสิ้น) ? `<span class="hand">${money(val(h.ยอดรวมทั้งสิ้น))}</span>` : money(h.ยอดรวมทั้งสิ้น)}</b></td></tr></table>`;
  } else if (isReceipt) {
    totals = `<table class="totals"><tr><td><b>รวมทั้งสิ้น</b></td><td class="num"><b>${money(h.ยอดรวมทั้งสิ้น)}</b></td></tr></table>`;
  } else {
    totals = `<p>หมายเหตุ: ${text(h.หมายเหตุ)}</p>`;
  }

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0 }
  body { margin: 0; background: #fff; font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif; color: #111; font-size: 14px }
  .page { width: 794px; min-height: 1000px; padding: 44px 52px; box-sizing: border-box }
  h1 { text-align: center; font-size: 24px; margin: 0 }
  .sub { text-align: center; color: #555; margin: 2px 0 6px }
  .watermark { text-align: center; color: #b00; font-size: 12px; margin-bottom: 18px }
  .row { display: flex; gap: 16px } .row .box { flex: 1 }
  .box { border: 1px solid #333; padding: 10px 12px; line-height: 1.75; margin-bottom: 12px }
  table { width: 100%; border-collapse: collapse; margin-top: 6px }
  th, td { border: 1px solid #333; padding: 6px 8px } th { background: #eee }
  td.num { text-align: right }
  .totals { width: 320px; margin-left: auto; margin-top: 10px } .totals td { border: none; padding: 3px 8px }
  .hand { font-family: "Segoe Script", "Ink Free", cursive; color: #1d3c8f; font-size: 17px }
  .sign { margin-top: 56px; display: flex; justify-content: space-between } .sign div { width: 210px; text-align: center; border-top: 1px dotted #333; padding-top: 6px }
  </style></head><body><div class="page">
  <h1>${esc(f.title)}</h1><div class="sub">${esc(f.subtitle)}</div>
  <div class="watermark">เอกสารตัวอย่างสำหรับทดสอบระบบ ไม่ใช่เอกสารจริง</div>
  <div class="row">${parties}<div class="box" style="flex:0 0 230px">เลขที่: <b>${esc(no)}</b><br>วันที่: <b>${thaiDate(date)}</b></div></div>
  ${buyer}
  <table><tr>${head}</tr>${rows}</table>
  ${totals}
  <div class="sign"><div>${isReq ? "ผู้ขอเบิก" : "ผู้รับเงิน"}</div><div>${isReq ? "ผู้อนุมัติ" : "ผู้รับสินค้า"}</div></div>
  </div></body></html>`;
}

const manifest = [];
for (const f of FIXTURES) {
  const htmlPath = new URL(`${f.file}.html`, TMP);
  writeFileSync(htmlPath, html(f), "utf8");
  const out = new URL(f.file, OUT);
  const url = pathToFileURL(htmlPath.pathname.replace(/^\//, "")).href;
  const common = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-pdf-header-footer"];
  if (f.file.endsWith(".pdf")) {
    execFileSync(CHROME, [...common, `--print-to-pdf=${out.pathname.replace(/^\//, "")}`, url], { stdio: "ignore" });
  } else {
    execFileSync(CHROME, [...common, `--screenshot=${out.pathname.replace(/^\//, "")}`, "--window-size=794,1050", url], { stdio: "ignore" });
  }
  manifest.push({
    file: f.file,
    mimeType: f.file.endsWith(".pdf") ? "application/pdf" : "image/png",
    pageCount: 1,
    documentType: f.documentType,
    header: f.header,
    lineItems: f.lineItems,
  });
  console.log("rendered", f.file);
}
writeFileSync(new URL("manifest.json", OUT), JSON.stringify(manifest, null, 2) + "\n", "utf8");
rmSync(TMP, { recursive: true, force: true });
console.log(`wrote ${manifest.length} fixtures`);
