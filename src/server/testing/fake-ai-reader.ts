import type { DocumentType } from "@/domain/types";
import type { AiReader, DocumentFile, ExtractionOutput } from "../ports";

type ExtractResponse =
  | ExtractionOutput
  | Error
  | ((file: DocumentFile, documentType: DocumentType) => ExtractionOutput | Promise<ExtractionOutput>);

// Scripted stand-in for the Claude adapter. Queue a response per call with
// willExtract; an Error is thrown instead of returned.
export class FakeAiReader implements AiReader {
  private extractResponses: ExtractResponse[] = [];
  extractCalls: { file: DocumentFile; documentType: DocumentType }[] = [];
  // Highest number of extract calls running at the same moment.
  peakConcurrentExtracts = 0;
  private running = 0;

  willExtract(...responses: ExtractResponse[]): this {
    this.extractResponses.push(...responses);
    return this;
  }

  async extract(file: DocumentFile, documentType: DocumentType): Promise<ExtractionOutput> {
    this.extractCalls.push({ file, documentType });
    this.running += 1;
    this.peakConcurrentExtracts = Math.max(this.peakConcurrentExtracts, this.running);
    try {
      // Yield so calls started together really overlap.
      await new Promise((resolve) => setTimeout(resolve, 1));
      const next = this.extractResponses.shift();
      if (next === undefined) throw new Error("FakeAiReader: no scripted extract response");
      if (next instanceof Error) throw next;
      return typeof next === "function" ? await next(file, documentType) : next;
    } finally {
      this.running -= 1;
    }
  }
}
