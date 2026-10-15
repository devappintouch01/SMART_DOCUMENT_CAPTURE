import type { AiReader } from "../ports";

// Scripted stand-in for the Claude adapter. Each AI operation gets a queue of
// scripted responses once the ticket adding that operation lands.
export class FakeAiReader implements AiReader {}
