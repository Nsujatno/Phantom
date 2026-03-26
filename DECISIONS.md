This is a file meant for me to keep track of decisions I make while building this project.

1. How to handle application forms:
- First we run through a local deterministic classifier if it's a job listing page, auto click apply type button
- If the page is messy and the deterministic classifier is unsure, we send it to the LLM to classify and go through the form.