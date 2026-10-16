// The Claude models the superadmin can pick to read Documents, with the
// published price (USD per million tokens) used to estimate cost.

export const EXTRACTION_MODEL_SETTING = "extraction_model";

export type ExtractionModel = {
  id: string;
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  // One line for the picker: how it trades accuracy against cost.
  note: string;
};

export const EXTRACTION_MODELS: ExtractionModel[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    inputPerMTok: 4,
    outputPerMTok: 20,
    note: "ฉลาดที่สุด แพงที่สุด",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    note: "สมดุลระหว่างความแม่นยำกับราคา",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    note: "ถูกที่สุด เร็วที่สุด",
  },
];

export function isExtractionModel(id: string): boolean {
  return EXTRACTION_MODELS.some((m) => m.id === id);
}

// USD per million tokens (input, output) for a model id, or null when unknown.
export function priceFor(model: string): [input: number, output: number] | null {
  const found = EXTRACTION_MODELS.find((m) => m.id === model);
  return found ? [found.inputPerMTok, found.outputPerMTok] : null;
}
