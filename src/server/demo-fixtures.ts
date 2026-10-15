import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DemoFixture } from "@/domain/demo";

type ManifestEntry = Omit<DemoFixture, "bytes" | "fileName"> & { file: string };

// The example documents committed under fixtures/demo/ (built by
// `npm run fixtures:build`). next.config traces this folder into the /demo
// route so it is present on Vercel.
export async function loadDemoFixtures(): Promise<DemoFixture[]> {
  const dir = path.join(process.cwd(), "fixtures", "demo");
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as ManifestEntry[];
  return Promise.all(
    manifest.map(async ({ file, ...rest }) => ({
      ...rest,
      fileName: file,
      bytes: new Uint8Array(await readFile(path.join(dir, file))),
    })),
  );
}
