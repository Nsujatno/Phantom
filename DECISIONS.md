This is a file meant for me to keep track of decisions I make while building this project.

1. How to handle application forms:
- First we run through a local deterministic classifier if it's a job listing page, auto click apply type button
- If the page is messy and the deterministic classifier is unsure, we send it to the LLM to classify and go through the form.

2. How to handle form fields with unresolvable labels:
- Some fields have no `<label>`, `aria-label`, or meaningful placeholder — only an opaque machine `name` like `q_3f8a1`, or nothing at all. These previously fell back to `"Unknown Field"`, which gave Gemini no useful signal.
- Fields where the label resolved only from the raw `name` attribute, or resolved to `"Unknown Field"`, are now flagged in the extension as low-confidence.
- For those fields, the element's own `outerHTML` is collected, sanitized (strip `value` attrs, remove hidden input siblings), capped at 800 chars, and sent to the backend as `html_snippet`.
- The label is set to the sentinel `"__needs_inference__"` so the Pydantic validator still passes.
- On the backend, the Gemini prompt includes an instruction: for fields marked `__needs_inference__`, infer the true label from `html_snippet` before answering.
- Inferred fields are logged to the Rich console; the response schema and Notion logging are untouched.