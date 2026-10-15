import { after } from "next/server";
import { getDocumentService } from "@/server/container";

// Long enough for a batch of Extractions on Vercel's free plan.
export const maxDuration = 300;

// Called by the result list while Documents are Queued or Extracting. Each
// call makes sure someone is working the queue; claiming is atomic, so
// overlapping calls never read the same Document twice.
export async function POST() {
  after(() => getDocumentService().processQueue());
  return Response.json({ ok: true });
}
