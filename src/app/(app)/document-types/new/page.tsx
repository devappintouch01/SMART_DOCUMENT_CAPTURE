import type { Metadata } from "next";
import Link from "next/link";
import { getDocumentService } from "@/server/container";
import { NewDocumentTypeFlow } from "./new-flow";

export const metadata: Metadata = { title: "สร้างประเภทเอกสาร" };
export const dynamic = "force-dynamic";
// Drafting Fields from a Sample Document is an AI call.
export const maxDuration = 300;

export default async function NewDocumentTypePage() {
  const types = await getDocumentService().listDocumentTypes();

  return (
    <section>
      <Link href="/document-types" className="text-sm text-neutral-500 hover:text-foreground">
        ← ประเภทเอกสาร
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">สร้างประเภทเอกสารใหม่</h1>
      <NewDocumentTypeFlow takenNames={types.map((t) => t.name)} />
    </section>
  );
}
