# Use an AI vision model instead of an OCR engine

Despite the project name, we do not run a dedicated OCR engine such as Tesseract. Each document is sent to a multimodal AI model through an API, and the model reads the document and returns the extracted data in one step. Dedicated OCR engines read Thai poorly and return raw text, which would still need a second step to turn into fields. An AI model is slower and costs money per document, but a 5–10 minute wait per document is acceptable for this proof of concept, and accuracy on the demo matters more than speed or cost.

We call the Anthropic API directly, not through OpenRouter, and use Claude Opus 5.5 because the documents mix Thai, English and some handwriting. The model name is an environment variable, so a cheaper model can be swapped in without code changes.
