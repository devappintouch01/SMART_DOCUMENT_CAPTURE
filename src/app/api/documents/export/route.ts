import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_IDS = 200;

// GET /api/documents/export?ids=a,b,c : one workbook for several Documents of
// the same Document Type.
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  try {
    const { fileName, bytes } = await getDocumentService().exportDocuments(ids);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": XLSX,
        "content-disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UserFacingError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error(error);
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
