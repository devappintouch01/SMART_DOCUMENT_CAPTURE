import { getDocumentService } from "@/server/container";
import { UserFacingError } from "@/server/document-service";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: Request, context: RouteContext<"/api/documents/[id]/export">) {
  const { id } = await context.params;
  try {
    const { fileName, bytes } = await getDocumentService().exportDocument(id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": XLSX,
        // The UTF-8 form carries the real (often Thai) name; the plain one is a fallback.
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
