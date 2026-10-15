// The demo reset: wipes everything and loads a few finished example Documents.

export const DEMO_RESET_PHRASE = "รีเซ็ต";

// A value in a fixture: plain text, or text with a note that the AI should have
// been unsure of it (flag) and/or that it is handwritten in the example (hand).
export type DemoValue = string | { v: string; flag?: string; hand?: boolean };

export type DemoFixture = {
  fileName: string;
  mimeType: string;
  pageCount: number;
  bytes: Uint8Array;
  // Name of a seeded Document Type.
  documentType: string;
  // Keyed by Field name.
  header: Record<string, DemoValue>;
  lineItems: Record<string, DemoValue>[];
};
